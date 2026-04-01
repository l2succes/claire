/**
 * Matrix Bridge Adapter
 *
 * Implements IPlatformAdapter using Matrix bridges (mautrix-*).
 * This single adapter handles all platforms by routing through Matrix.
 */

import {
  createClient,
  MatrixClient,
  ClientEvent,
  RoomEvent,
  RoomMemberEvent,
  Room,
  MatrixEvent,
  Preset,
  MsgType,
  EventType,
} from 'matrix-js-sdk';
import { BasePlatformAdapter } from '../base-adapter';
import { supabase } from '../../services/supabase';
import {
  Platform,
  AuthMethod,
  PlatformCapabilities,
  PlatformSession,
  PlatformStatus,
  UnifiedMessage,
  UnifiedContact,
  UnifiedChat,
  OutgoingMessage,
  MessageContentType,
} from '../types';
import { MatrixConfig, BRIDGE_BOT_LOCALPARTS } from './types';
import { MatrixRoomMapper } from './room-mapper';
import { MatrixUserMapper } from './user-mapper';
import { MatrixEventConverter } from './event-converter';
import { BridgeAuthManager, BridgeAuthConfig } from './bridge-auth';

export interface MatrixSessionConfig {
  platform: Platform;
  bridgeConfig?: BridgeAuthConfig;
}

export class MatrixBridgeAdapter extends BasePlatformAdapter {
  // Default platform - overridden per session
  readonly platform = Platform.WHATSAPP;
  readonly authMethod = AuthMethod.QR_CODE;
  readonly capabilities: PlatformCapabilities = {
    canSendText: true,
    canSendMedia: true,
    canSendStickers: true,
    canSendVoice: true,
    canSendLocation: true,
    canCreateGroups: false,
    canReadReceipts: true,
    canEditMessages: true,
    canDeleteMessages: true,
    canReactToMessages: true,
    canReplyToMessages: true,
    maxMessageLength: 65536,
    supportedMediaTypes: [
      MessageContentType.TEXT,
      MessageContentType.IMAGE,
      MessageContentType.VIDEO,
      MessageContentType.AUDIO,
      MessageContentType.DOCUMENT,
    ],
  };

  private matrixClient: MatrixClient | null = null;
  private roomMapper: MatrixRoomMapper;
  private userMapper: MatrixUserMapper;
  private eventConverter: MatrixEventConverter;
  private bridgeAuthManager: BridgeAuthManager;

  // Maps sessionId -> control room ID
  private sessionControlRooms: Map<string, string> = new Map();
  // Maps sessionId -> platform
  private sessionPlatforms: Map<string, Platform> = new Map();
  // Maps sessionId -> the user's own ghost user ID (e.g. @whatsapp_15166100494:claire.local)
  private sessionSelfGhostIds: Map<string, string> = new Map();

  constructor(private config: MatrixConfig) {
    super();
    this.userMapper = new MatrixUserMapper(config.serverName);
    this.roomMapper = new MatrixRoomMapper(this.userMapper);
    this.eventConverter = new MatrixEventConverter(this.userMapper);
    this.bridgeAuthManager = new BridgeAuthManager();
  }

  /**
   * Initialize connection to Matrix homeserver
   */
  async initialize(): Promise<void> {
    this.log('info', 'Matrix bridge adapter initializing...');

    // Create Matrix client
    this.matrixClient = createClient({
      baseUrl: this.config.homeserverUrl,
      accessToken: this.config.adminAccessToken,
      userId: this.config.botUserId || `@claire_bot:${this.config.serverName}`,
    });

    // Setup event handlers BEFORE starting client so we capture initial sync events
    this.setupMatrixEventHandlers();

    // Wait for initial sync
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Matrix sync timeout'));
      }, 30000);

      this.matrixClient!.once(ClientEvent.Sync, (state) => {
        clearTimeout(timeout);
        if (state === 'PREPARED') {
          resolve();
        } else {
          reject(new Error(`Unexpected sync state: ${state}`));
        }
      });

      this.matrixClient!.startClient({ initialSyncLimit: 50 });
    });

    // Restore existing sessions
    await this.restoreExistingSessions();

    // Register all existing rooms so messages can be routed to correct sessions
    await this.registerExistingRooms();

    // Backfill recent history for any already-connected sessions
    await this.backfillRestoredSessions();

    // Sync contacts from Matrix room members into the database
    for (const [sessionId] of this.sessionPlatforms) {
      await this.syncContacts(sessionId);
    }

    this.log('info', 'Matrix bridge adapter initialized');
  }

  /**
   * Shutdown Matrix client
   */
  async shutdown(): Promise<void> {
    this.log('info', 'Matrix bridge adapter shutting down...');

    if (this.matrixClient) {
      this.matrixClient.stopClient();
      this.matrixClient = null;
    }

    this.sessions.clear();
    this.sessionControlRooms.clear();
    this.sessionPlatforms.clear();
    this.sessionSelfGhostIds.clear();
    this.roomMapper.clearCache();

    this.log('info', 'Matrix bridge adapter shutdown complete');
  }

  /**
   * Setup Matrix event handlers for incoming messages
   */
  private setupMatrixEventHandlers(): void {
    if (!this.matrixClient) return;

    // Auto-accept room invites from bridge bots
    this.matrixClient.on(RoomMemberEvent.Membership, async (event, member) => {
      if (member.userId !== this.matrixClient!.getUserId()) return;
      if (member.membership !== 'invite') return;

      // Accept all invites on our local homeserver
      try {
        await this.matrixClient!.joinRoom(member.roomId);
        this.log('info', `Auto-joined room ${member.roomId}`);

        // Register and backfill the newly joined room
        const room = this.matrixClient!.getRoom(member.roomId);
        if (room) {
          await this.tryRegisterRoom(room);
          for (const [sessionId, platform] of this.sessionPlatforms) {
            await this.syncRoomHistory(sessionId, platform);
          }
        }
      } catch (err: any) {
        this.log('warn', `Failed to auto-join room ${member.roomId}: ${err.message}`);
      }
    });

    // Handle incoming messages
    this.matrixClient.on(RoomEvent.Timeline, async (event, room, toStartOfTimeline) => {
      if (!room) return;
      if (toStartOfTimeline) return; // Ignore historical messages
      if (event.getType() !== 'm.room.message') return;

      const sender = event.getSender();
      if (sender === this.matrixClient!.getUserId()) return; // Ignore bot's own sends

      // Check if this is a control room message (from bridge bot)
      // Must happen BEFORE the m.notice filter — login success is sent as m.notice
      if (this.isControlRoomMessage(room, sender || '')) {
        await this.handleControlRoomMessage(event, room);
        return;
      }

      // Skip bridge notices in chat rooms (system messages, errors)
      if (event.getContent()?.msgtype === 'm.notice') return;

      // Check if this is a bridged chat message
      let chatInfo = this.roomMapper.getRoomChatInfo(room.roomId);
      if (!chatInfo) {
        // Try to detect and register the room, then re-fetch
        await this.tryRegisterRoom(room);
        chatInfo = this.roomMapper.getRoomChatInfo(room.roomId);
        if (!chatInfo) return;
      }

      // Convert and emit the message
      const session = this.sessions.get(chatInfo.sessionId);
      if (!session) return;

      const selfGhostId = this.sessionSelfGhostIds.get(chatInfo.sessionId);
      const unifiedMessage = await this.eventConverter.toUnifiedMessage(
        event,
        room,
        chatInfo.sessionId,
        session.userId,
        chatInfo.platform,
        selfGhostId
      );

      this.emitPlatformEvent('message', chatInfo.sessionId, unifiedMessage);
    });

    // Handle room invites
    this.matrixClient.on(RoomEvent.MyMembership, async (room, membership) => {
      if (membership === 'invite') {
        // Auto-accept invites from bridges
        try {
          await this.matrixClient!.joinRoom(room.roomId);
          this.log('info', `Joined room: ${room.roomId}`);
        } catch (error) {
          this.log('error', `Failed to join room ${room.roomId}`, { error });
        }
      }
    });
  }

  /**
   * Check if a message is from a control room (DM with bridge bot)
   */
  private isControlRoomMessage(room: Room, sender: string): boolean {
    return this.userMapper.isBridgeBot(sender) && this.roomMapper.isControlRoom(room);
  }

  /**
   * Handle messages from bridge bots in control rooms
   */
  private async handleControlRoomMessage(event: MatrixEvent, room: Room): Promise<void> {
    // Find which session this control room belongs to
    const sessionId = this.findSessionByControlRoom(room.roomId);
    if (!sessionId) return;

    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Check for WhatsApp pairing code (sent after "login phone" + phone number)
    if (this.eventConverter.isPairingCodeMessage(event)) {
      const pairingCode = this.eventConverter.extractPairingCode(event);
      if (pairingCode) {
        session.status = PlatformStatus.AWAITING_AUTH;
        session.authData = { pairingCode };
        await this.saveSessionToRedis(session);
        this.bridgeAuthManager.updatePairingCode(sessionId, pairingCode);
        this.emitPlatformEvent('pairing_code', sessionId, { pairingCode });
      }
      return;
    }

    // Check for QR code
    if (this.eventConverter.isQrCodeMessage(event)) {
      const mxcUrl = (event.getContent() as { url?: string }).url;
      if (mxcUrl) {
        // Fetch the image server-side with admin token and encode as base64 data URI
        // so the client doesn't need to make an authenticated request to Synapse
        const qrCodeDataUri = await this.fetchMxcAsDataUri(mxcUrl);
        if (qrCodeDataUri) {
          session.status = PlatformStatus.AWAITING_AUTH;
          session.authData = { qrCode: qrCodeDataUri };
          await this.saveSessionToRedis(session);
          this.bridgeAuthManager.updateQrCode(sessionId, qrCodeDataUri);
          this.emitPlatformEvent('qr_code', sessionId, { qrCode: qrCodeDataUri });
        }
      }
      return;
    }

    // Check for login success
    if (this.eventConverter.isLoginSuccessMessage(event)) {
      // Parse the user's phone number from "Successfully logged in as +15166100494"
      const body = (event.getContent() as { body?: string }).body || '';
      const phoneMatch = body.match(/\+(\d+)/);
      if (phoneMatch) {
        const platform = this.sessionPlatforms.get(sessionId);
        if (platform) {
          const prefix = this.userMapper.platformContactToGhostUser(phoneMatch[1], platform);
          this.sessionSelfGhostIds.set(sessionId, prefix);
          this.log('info', `Self ghost user for session ${sessionId}: ${prefix}`);
        }
      }

      session.status = PlatformStatus.CONNECTED;
      session.lastConnectedAt = new Date();
      // Persist selfGhostId alongside session for restore after restart
      (session as any).selfGhostId = this.sessionSelfGhostIds.get(sessionId) || null;
      await this.saveSessionToRedis(session);
      this.bridgeAuthManager.markAuthenticated(sessionId);
      this.emitPlatformEvent('session_ready', sessionId, {});

      // Register all platform rooms, backfill messages, and sync contacts
      const platform = this.sessionPlatforms.get(sessionId);
      if (platform) {
        await this.registerExistingRooms();
        await this.syncRoomHistory(sessionId, platform);
        await this.syncContacts(sessionId);
      }
      return;
    }

    // Check for login failure
    if (this.eventConverter.isLoginFailureMessage(event)) {
      const content = event.getContent();
      const errorMsg = content.body || 'Login failed';
      session.status = PlatformStatus.FAILED;
      session.error = errorMsg;
      await this.saveSessionToRedis(session);
      this.bridgeAuthManager.markFailed(sessionId, errorMsg);
      this.emitPlatformEvent('auth_failure', sessionId, { error: errorMsg });
      return;
    }
  }

  /**
   * Find session ID by control room
   */
  private findSessionByControlRoom(roomId: string): string | null {
    for (const [sessionId, controlRoomId] of this.sessionControlRooms) {
      if (controlRoomId === roomId) {
        return sessionId;
      }
    }
    return null;
  }

  /**
   * Try to register a room with appropriate session
   */
  private async tryRegisterRoom(room: Room): Promise<void> {
    const platform = this.roomMapper.detectRoomPlatform(room);
    if (!platform) return;

    // Find a session for this platform (needed to get selfGhostId)
    let matchingSessionId: string | undefined;
    for (const [sessionId, sessionPlatform] of this.sessionPlatforms) {
      if (sessionPlatform === platform) {
        matchingSessionId = sessionId;
        break;
      }
    }
    if (!matchingSessionId) return;

    const selfGhostId = this.sessionSelfGhostIds.get(matchingSessionId);

    // For group rooms use room.roomId as stable chatId to avoid collision with DMs.
    // Exclude the self ghost user (present in groups but not DMs) to avoid false positives.
    // Strategy: prefer phone-based contacts for counting (ignore LID duplicates of the same person).
    // If ALL contacts are LID-based (mautrix v2 all-LID group), fall back to counting LID contacts.
    const allGhostContacts = room.getJoinedMembers()
      .filter(m => !this.userMapper.isBridgeBot(m.userId) && m.userId !== selfGhostId)
      .map(m => this.userMapper.ghostUserToPlatformContact(m.userId))
      .filter((c): c is NonNullable<typeof c> => c !== null && c.platform === platform);

    const phoneContacts = allGhostContacts.filter(c => !c.platformContactId.startsWith('lid-'));
    const contactsForCounting = phoneContacts.length > 0 ? phoneContacts : allGhostContacts;
    const isGroup = contactsForCounting.length > 1;
    const chatId = isGroup ? room.roomId : this.roomMapper.getPrimaryChatParticipant(room, selfGhostId);
    if (!chatId) return;

    this.roomMapper.registerRoom(room.roomId, platform, chatId, matchingSessionId);
    this.log('info', `Registered room ${room.roomId} for ${platform} chat ${chatId} (${isGroup ? 'group' : 'dm'})`);
  }

  /**
   * Create a new session with a platform bridge
   */
  async createSession(
    userId: string,
    sessionId: string,
    config?: MatrixSessionConfig
  ): Promise<PlatformSession> {
    if (!this.matrixClient) {
      throw new Error('Matrix client not initialized');
    }

    const platform = config?.platform || Platform.WHATSAPP;

    // Create default session
    const session = this.createDefaultSession(userId, sessionId);
    // Set the actual platform for this session
    (session as PlatformSession & { platform: Platform }).platform = platform;

    this.sessions.set(sessionId, session);
    this.sessionPlatforms.set(sessionId, platform);

    // Find or create control room with bridge bot
    const bridgeBotUserId = `@${BRIDGE_BOT_LOCALPARTS[platform]}:${this.config.serverName}`;
    const controlRoom = await this.findOrCreateControlRoom(bridgeBotUserId);
    this.sessionControlRooms.set(sessionId, controlRoom.roomId);

    // Merge explicit bridgeConfig with any top-level fields (e.g. phoneNumber from connect body)
    const bridgeConfig = {
      ...config?.bridgeConfig,
      ...(( config as Record<string, unknown> )?.phoneNumber ? { phoneNumber: ( config as Record<string, unknown> ).phoneNumber as string } : {}),
    };

    // Initiate auth flow
    await this.bridgeAuthManager.initiateAuth(
      this.matrixClient,
      controlRoom.roomId,
      platform,
      sessionId,
      bridgeConfig
    );

    session.status = PlatformStatus.AWAITING_AUTH;
    await this.saveSessionToRedis(session);

    return session;
  }

  /**
   * Find or create a DM room with a bridge bot
   */
  private async findOrCreateControlRoom(
    bridgeBotUserId: string
  ): Promise<{ roomId: string }> {
    if (!this.matrixClient) {
      throw new Error('Matrix client not initialized');
    }

    // Check existing rooms for DM with this bot
    const rooms = this.matrixClient.getRooms();
    for (const room of rooms) {
      const members = room.getJoinedMembers();
      if (
        members.length === 2 &&
        members.some((m) => m.userId === bridgeBotUserId)
      ) {
        return { roomId: room.roomId };
      }
    }

    // Create new DM room
    const response = await this.matrixClient.createRoom({
      is_direct: true,
      invite: [bridgeBotUserId],
      preset: Preset.TrustedPrivateChat,
    });

    return { roomId: response.room_id };
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<PlatformSession | null> {
    const cachedSession = this.sessions.get(sessionId);
    if (cachedSession) {
      return cachedSession;
    }

    const session = await this.loadSessionFromRedis(sessionId);
    if (session) {
      this.sessions.set(sessionId, session);
      // Restore platform mapping
      const platform = (session as PlatformSession & { platform?: Platform }).platform;
      if (platform) {
        this.sessionPlatforms.set(sessionId, platform);
      }
    }
    return session;
  }

  /**
   * Get all sessions for a user
   */
  async getUserSessions(userId: string): Promise<PlatformSession[]> {
    const sessions: PlatformSession[] = [];

    for (const session of this.sessions.values()) {
      if (session.userId === userId) {
        sessions.push(session);
      }
    }

    return sessions;
  }

  /**
   * Disconnect a session
   */
  async disconnectSession(sessionId: string): Promise<void> {
    const controlRoom = this.sessionControlRooms.get(sessionId);

    if (controlRoom && this.matrixClient) {
      // Send logout command to bridge
      await this.bridgeAuthManager.logout(this.matrixClient, sessionId);
    }

    // Clean up
    this.sessionControlRooms.delete(sessionId);
    this.sessionPlatforms.delete(sessionId);
    this.sessionSelfGhostIds.delete(sessionId);

    await this.updateSessionStatus(sessionId, PlatformStatus.DISCONNECTED);
    this.emitPlatformEvent('session_disconnected', sessionId, { reason: 'manual' });
  }

  /**
   * Reconnect a session
   */
  async reconnectSession(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const platform = this.sessionPlatforms.get(sessionId);
    if (!platform) {
      throw new Error('Session platform not found');
    }

    // Re-initiate auth flow
    const controlRoom = this.sessionControlRooms.get(sessionId);
    if (controlRoom && this.matrixClient) {
      await this.bridgeAuthManager.initiateAuth(
        this.matrixClient,
        controlRoom,
        platform,
        sessionId
      );
    }

    session.status = PlatformStatus.RECONNECTING;
    await this.saveSessionToRedis(session);
  }

  /**
   * Get authentication data for a session
   */
  async getAuthData(sessionId: string): Promise<unknown> {
    const session = await this.getSession(sessionId);
    const authState = this.bridgeAuthManager.getAuthState(sessionId);
    const platform = this.sessionPlatforms.get(sessionId);

    return {
      method: this.getAuthMethodForPlatform(platform),
      qrCode: session?.authData?.qrCode || authState?.qrCodeUrl,
      status: session?.status,
      platform,
      instructions: this.getAuthInstructions(platform),
    };
  }

  private getAuthMethodForPlatform(platform?: Platform): string {
    switch (platform) {
      case Platform.WHATSAPP:
        return 'qr_code';
      case Platform.TELEGRAM:
        return 'phone_verification';
      case Platform.INSTAGRAM:
        return 'cookie_auth';
      default:
        return 'unknown';
    }
  }

  private getAuthInstructions(platform?: Platform): string {
    switch (platform) {
      case Platform.WHATSAPP:
        return 'Scan the QR code with WhatsApp on your phone';
      case Platform.TELEGRAM:
        return 'Enter the verification code sent to your phone';
      case Platform.INSTAGRAM:
        return 'Extract cookies from your browser and paste them';
      default:
        return 'Follow the authentication prompts';
    }
  }

  /**
   * Send a message via Matrix
   */
  async sendMessage(
    sessionId: string,
    chatId: string,
    message: OutgoingMessage
  ): Promise<UnifiedMessage> {
    if (!this.matrixClient) {
      throw new Error('Matrix client not initialized');
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const platform = this.sessionPlatforms.get(sessionId);
    if (!platform) {
      throw new Error('Session platform not found');
    }

    // Find the Matrix room for this chat
    const roomId = await this.roomMapper.findRoomForChat(
      this.matrixClient,
      platform,
      chatId
    );

    if (!roomId) {
      throw new Error(`No Matrix room found for chat ${chatId}`);
    }

    // Send the message
    let eventId: string;

    if (message.media && message.media.length > 0) {
      // Upload and send media
      const media = message.media[0];
      const uploaded = await this.matrixClient.uploadContent(media.data as Buffer, {
        type: media.mimeType,
      });

      const msgtype = this.contentTypeToMatrixMsgtype(media.type);
      // Send media message using sendEvent for better type compatibility
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await this.matrixClient.sendEvent(roomId, EventType.RoomMessage, {
        msgtype: msgtype as any,
        body: message.content || media.fileName || 'media',
        url: uploaded.content_uri,
      });
      eventId = response.event_id;
    } else {
      // Send text message
      const response = await this.matrixClient.sendEvent(roomId, EventType.RoomMessage, {
        msgtype: MsgType.Text,
        body: message.content,
      });
      eventId = response.event_id;
    }

    return {
      id: `matrix-${eventId}-${Date.now()}`,
      platformMessageId: eventId,
      platform,
      sessionId,
      userId: session.userId,
      content: message.content,
      contentType: message.contentType || MessageContentType.TEXT,
      senderId: 'me',
      chatId,
      chatType: 'individual',
      timestamp: new Date(),
      isFromMe: true,
      isRead: true,
      hasMedia: !!message.media?.length,
    };
  }

  private contentTypeToMatrixMsgtype(contentType: MessageContentType): MsgType {
    switch (contentType) {
      case MessageContentType.IMAGE:
        return MsgType.Image;
      case MessageContentType.VIDEO:
        return MsgType.Video;
      case MessageContentType.AUDIO:
      case MessageContentType.VOICE:
        return MsgType.Audio;
      case MessageContentType.DOCUMENT:
        return MsgType.File;
      default:
        return MsgType.Text;
    }
  }

  /**
   * Mark a message as read
   */
  async markAsRead(
    sessionId: string,
    chatId: string,
    messageId: string
  ): Promise<void> {
    if (!this.matrixClient) return;

    const platform = this.sessionPlatforms.get(sessionId);
    if (!platform) return;

    const roomId = await this.roomMapper.findRoomForChat(
      this.matrixClient,
      platform,
      chatId
    );

    if (roomId) {
      await this.matrixClient.sendReadReceipt(
        { getId: () => messageId } as MatrixEvent
      );
    }
  }

  /**
   * Get contacts from bridged chats
   */
  async getContacts(sessionId: string): Promise<UnifiedContact[]> {
    if (!this.matrixClient) return [];

    const session = this.sessions.get(sessionId);
    if (!session) return [];

    const platform = this.sessionPlatforms.get(sessionId);
    if (!platform) return [];

    const contacts: UnifiedContact[] = [];
    const rooms = this.matrixClient.getRooms();
    const selfGhostId = this.sessionSelfGhostIds.get(sessionId);

    for (const room of rooms) {
      if (this.roomMapper.detectRoomPlatform(room) !== platform) continue;

      const members = room.getJoinedMembers();
      for (const member of members) {
        if (this.userMapper.isBridgeBot(member.userId)) continue;
        if (selfGhostId && member.userId === selfGhostId) continue;

        const contact = this.userMapper.matrixMemberToContact(
          member.userId,
          member.name,
          member.getAvatarUrl(this.config.homeserverUrl, 64, 64, 'crop', false, false) || undefined,
          session.userId
        );

        if (contact && !contacts.some((c) => c.platformContactId === contact.platformContactId)) {
          contacts.push(contact);
        }
      }
    }

    return contacts;
  }

  /**
   * Get chats for a session
   */
  async getChats(sessionId: string): Promise<UnifiedChat[]> {
    if (!this.matrixClient) return [];

    const session = this.sessions.get(sessionId);
    if (!session) return [];

    const platform = this.sessionPlatforms.get(sessionId);
    if (!platform) return [];

    const chats: UnifiedChat[] = [];
    const rooms = this.matrixClient.getRooms();

    for (const room of rooms) {
      // Skip control rooms
      if (this.roomMapper.isControlRoom(room)) continue;

      // Check if room is for this platform
      if (this.roomMapper.detectRoomPlatform(room) !== platform) continue;

      const chatId = this.roomMapper.getPrimaryChatParticipant(room);
      if (!chatId) continue;

      chats.push({
        id: `matrix-chat-${room.roomId}`,
        platformChatId: chatId,
        platform,
        userId: session.userId,
        name: room.name,
        isGroup: room.getJoinedMemberCount() > 2,
        lastMessageAt: room.getLastActiveTimestamp()
          ? new Date(room.getLastActiveTimestamp())
          : undefined,
        unreadCount: room.getUnreadNotificationCount(),
      });
    }

    return chats;
  }

  /**
   * Get chat history
   */
  async getChatHistory(
    sessionId: string,
    chatId: string,
    limit: number = 50
  ): Promise<UnifiedMessage[]> {
    if (!this.matrixClient) return [];

    const session = this.sessions.get(sessionId);
    if (!session) return [];

    const platform = this.sessionPlatforms.get(sessionId);
    if (!platform) return [];

    const roomId = await this.roomMapper.findRoomForChat(
      this.matrixClient,
      platform,
      chatId
    );

    if (!roomId) return [];

    const room = this.matrixClient.getRoom(roomId);
    if (!room) return [];

    const timeline = room.getLiveTimeline();
    const events = timeline.getEvents().slice(-limit);
    const selfGhostId = this.sessionSelfGhostIds.get(sessionId);

    const messages: UnifiedMessage[] = [];
    for (const event of events) {
      if (event.getType() === 'm.room.message' && event.getContent()?.msgtype !== 'm.notice') {
        messages.push(
          await this.eventConverter.toUnifiedMessage(
            event,
            room,
            sessionId,
            session.userId,
            platform,
            selfGhostId
          )
        );
      }
    }

    return messages;
  }

  /**
   * Restore existing sessions from Redis
   */
  private async restoreExistingSessions(): Promise<void> {
    try {
      const keys = await this.getAllSessionKeys();

      for (const key of keys) {
        const sessionId = key.replace(this.sessionPrefix, '');
        const session = await this.loadSessionFromRedis(sessionId);

        if (session && session.status === PlatformStatus.CONNECTED) {
          this.sessions.set(sessionId, session);
          const platform = (session as PlatformSession & { platform?: Platform }).platform;
          if (platform) {
            this.sessionPlatforms.set(sessionId, platform);
          }
          // Restore self ghost ID from persisted session data
          const selfGhostId = (session as any).selfGhostId;
          if (selfGhostId) {
            this.sessionSelfGhostIds.set(sessionId, selfGhostId);
          }
          this.log('info', `Restored Matrix session: ${sessionId} (selfGhost: ${selfGhostId || 'unknown'})`);
        }
      }

      this.log('info', `Restored ${this.sessions.size} Matrix sessions`);
    } catch (error) {
      this.log('error', 'Failed to restore Matrix sessions', { error });
    }
  }

  /**
   * Backfill history for all restored connected sessions.
   * Called after registerExistingRooms() so room mappings are available.
   */
  private async backfillRestoredSessions(): Promise<void> {
    for (const [sessionId, platform] of this.sessionPlatforms) {
      const session = this.sessions.get(sessionId);
      if (session?.status === PlatformStatus.CONNECTED) {
        await this.syncRoomHistory(sessionId, platform);
      }
    }
  }

  /**
   * Sync contacts from Matrix room members into Supabase.
   */
  private async syncContacts(sessionId: string): Promise<void> {
    try {
      const contacts = await this.getContacts(sessionId);
      if (contacts.length === 0) return;

      const session = this.sessions.get(sessionId);
      if (!session) return;

      const selfGhostId = this.sessionSelfGhostIds.get(sessionId);
      let synced = 0;

      for (const contact of contacts) {
        // Skip the user's own ghost contact
        if (selfGhostId) {
          const selfContact = this.userMapper.ghostUserToPlatformContact(selfGhostId);
          if (selfContact && selfContact.platformContactId === contact.platformContactId) continue;
        }

        const { error } = await supabase
          .from('contacts')
          .upsert({
            user_id: session.userId,
            platform: contact.platform,
            platform_contact_id: contact.platformContactId,
            whatsapp_id: contact.platformContactId,
            name: contact.displayName || contact.platformContactId,
            avatar_url: contact.avatarUrl || null,
            phone_number: /^\d+$/.test(contact.platformContactId) ? contact.platformContactId : null,
          }, { onConflict: 'user_id,platform,platform_contact_id' });

        if (!error) synced++;
      }

      this.log('info', `Synced ${synced} contacts for session ${sessionId}`);
    } catch (error) {
      this.log('error', 'Failed to sync contacts', { error });
    }
  }

  /**
   * Register all known Matrix rooms with the room mapper.
   * Must be called after the initial sync so getRooms() is populated.
   */
  private async registerExistingRooms(): Promise<void> {
    if (!this.matrixClient) return;

    const rooms = this.matrixClient.getRooms();
    let registered = 0;

    for (const room of rooms) {
      if (this.roomMapper.isControlRoom(room)) continue;
      if (this.roomMapper.getRoomChatInfo(room.roomId)) continue; // already registered

      const platform = this.roomMapper.detectRoomPlatform(room);
      if (!platform) continue;

      const chatId = this.roomMapper.getPrimaryChatParticipant(room);
      if (!chatId) continue;

      // Find the session for this platform
      for (const [sessionId, sessionPlatform] of this.sessionPlatforms) {
        if (sessionPlatform === platform) {
          this.roomMapper.registerRoom(room.roomId, platform, chatId, sessionId);
          registered++;
          break;
        }
      }
    }

    this.log('info', `Registered ${registered} existing Matrix rooms`);
  }

  /**
   * Emit all timeline events from known rooms as messages.
   * Called after login to backfill recent chat history into the DB.
   */
  private async syncRoomHistory(sessionId: string, platform: Platform): Promise<void> {
    if (!this.matrixClient) return;

    const session = this.sessions.get(sessionId);
    if (!session) return;

    const rooms = this.matrixClient.getRooms();
    let messageCount = 0;

    const selfGhostId = this.sessionSelfGhostIds.get(sessionId);

    for (const room of rooms) {
      const chatInfo = this.roomMapper.getRoomChatInfo(room.roomId);
      if (!chatInfo || chatInfo.sessionId !== sessionId) continue;

      const events = room.getLiveTimeline().getEvents();
      for (const event of events) {
        if (event.getType() !== 'm.room.message') continue;
        if (event.getContent()?.msgtype === 'm.notice') continue;

        const unifiedMessage = await this.eventConverter.toUnifiedMessage(
          event,
          room,
          sessionId,
          session.userId,
          platform,
          selfGhostId
        );

        this.emitPlatformEvent('message', sessionId, unifiedMessage);
        messageCount++;
      }
    }

    this.log('info', `Backfilled ${messageCount} messages for ${platform} session ${sessionId}`);
  }

  /**
   * Fetch an mxc:// media item using the admin token and return as a base64 data URI.
   * Required because Synapse has authenticated media enabled (Synapse 1.98+),
   * so the unauthenticated /_matrix/media/v3/download endpoint returns 404.
   */
  private async fetchMxcAsDataUri(mxcUrl: string): Promise<string | null> {
    try {
      // mxc://server/mediaId -> http://homeserver/_matrix/client/v1/media/download/server/mediaId
      const match = mxcUrl.match(/^mxc:\/\/([^/]+)\/(.+)$/);
      if (!match) return null;
      const [, server, mediaId] = match;

      const httpUrl = `${this.config.homeserverUrl}/_matrix/client/v1/media/download/${server}/${mediaId}`;
      const response = await fetch(httpUrl, {
        headers: { Authorization: `Bearer ${this.config.adminAccessToken}` },
      });

      if (!response.ok) {
        this.log('warn', `Failed to fetch QR media: ${response.status}`);
        return null;
      }

      const buffer = await response.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      const contentType = response.headers.get('content-type') || 'image/png';
      return `data:${contentType};base64,${base64}`;
    } catch (error) {
      this.log('error', 'Error fetching QR code media', { error });
      return null;
    }
  }
}

// Export for use in index.ts
export type { MatrixConfig } from './types';
