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
import { supabase, type DbRow } from '../../services/supabase';
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
import {
  fromPersistedMatrixSession,
  PersistedMatrixSessionRow,
  toPersistedMatrixSession,
} from './session-persistence';

export interface MatrixSessionConfig {
  platform: Platform;
  bridgeConfig?: BridgeAuthConfig;
}

export class MatrixBridgeAdapter extends BasePlatformAdapter {
  // A provisioning login is only resumable while the client holds its
  // login/step identifiers. Keep a short grace window so abandoned Instagram
  // attempts cannot remain "Awaiting authentication" forever in Settings.
  private static readonly INSTAGRAM_AUTH_EXPIRY_MS = 20 * 60 * 1000;
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
  // Maps sessionId -> real Matrix user ID for double-puppeting (e.g. @user123:claire.local)
  private sessionMatrixUserIds: Map<string, string> = new Map();
  // Whether double puppeting is enabled (bridges configured with double_puppet.secrets)
  private readonly doublePuppetEnabled: boolean = process.env.ENABLE_DOUBLE_PUPPETING === 'true';
  // Event IDs that this server sent (to avoid double-counting bot's own sends as incoming)
  private localSentEventIds: Set<string> = new Set();
  private durableSessionStorageAvailable = true;

  /**
   * Redis keeps short-lived login state, but connected Matrix identities must
   * survive its TTL and an app restart. Persist identity metadata separately;
   * never store authData here because it can contain one-time auth material.
   */
  protected override async saveSessionToRedis(session: PlatformSession): Promise<void> {
    await super.saveSessionToRedis(session);
    await this.saveSessionDurably(session);
  }

  private async saveSessionDurably(session: PlatformSession): Promise<void> {
    if (!this.durableSessionStorageAvailable) return;

    const { error } = await supabase
      .from('platform_sessions')
      .upsert(toPersistedMatrixSession(session), { onConflict: 'session_id,platform' });
    if (error) {
      // Local/test stacks created before platform_sessions should not lose the
      // active Redis flow. Avoid repeating the same warning on every event.
      this.durableSessionStorageAvailable = false;
      this.log('warn', 'Could not persist Matrix session metadata', { error: error.message });
    }
  }

  private getSelfGhostIds(sessionId: string, session: PlatformSession, platform: Platform): string[] {
    const known = this.sessionSelfGhostIds.get(sessionId);
    const platformUserId = session.platformUserId || session.phoneNumber;
    const derived = this.userMapper.selfGhostUserIds(platform, platformUserId);
    // The identity returned by the bridge login is authoritative. Keep a
    // persisted ghost as an additional exact alias (not a fuzzy match) so a
    // WhatsApp phone/LID transition does not turn the user's own messages
    // into incoming ones after a restart.
    if (derived.length > 0 && known !== derived[0]) {
      this.sessionSelfGhostIds.set(sessionId, derived[0]);
      session.selfGhostId = derived[0];
    }
    const configuredAliases = this.config.configuredSelfGhostIds?.[platform] || [];
    return [...new Set([
      ...derived,
      ...(known ? [known] : []),
      ...(session.selfGhostIds || []),
      ...configuredAliases,
    ])].filter((id) => this.userMapper.ghostUserToPlatformContact(id)?.platform === platform);
  }

  /**
   * Ask the bridge to resolve the connected account's network ID to every
   * exact Matrix ghost alias. This is essential for WhatsApp accounts that
   * log in with a phone number but emit own-device messages as an LID ghost.
   */
  private async resolveAndPersistSelfGhostIds(
    sessionId: string,
    session: PlatformSession,
    platform: Platform
  ): Promise<string[]> {
    const derived = this.getSelfGhostIds(sessionId, session, platform);
    const platformUserId = session.platformUserId || session.phoneNumber;
    if (!platformUserId || !this.config.resolveSelfGhostIds) {
      session.selfGhostIds = derived;
      return derived;
    }

    try {
      const resolved = await this.config.resolveSelfGhostIds(platform, platformUserId);
      const exactAliases = resolved.filter((id) => {
        const contact = this.userMapper.ghostUserToPlatformContact(id);
        return contact?.platform === platform;
      });
      const all = [...new Set([...derived, ...exactAliases])];
      session.selfGhostIds = all;
      await this.saveSessionToRedis(session);
      if (exactAliases.length > 0) {
        this.log('info', `Resolved self ghost aliases for ${sessionId}: ${exactAliases.join(', ')}`);
      }
      return all;
    } catch (error) {
      this.log('warn', `Could not resolve bridge identity aliases for ${sessionId}`, { error });
      return derived;
    }
  }

  private mediaProxyPath(mediaUrl: unknown): string | null {
    if (typeof mediaUrl !== 'string' || !mediaUrl) return null;
    if (mediaUrl.startsWith('/media/')) return mediaUrl;
    const match = mediaUrl.match(/^mxc:\/\/([^/]+)\/(.+)$/)
      || mediaUrl.match(/\/_matrix\/(?:client\/v1\/media|media\/v3)\/(?:thumbnail|download)\/([^/]+)\/([^?]+)/);
    return match ? `/media/${encodeURIComponent(match[1])}/${encodeURIComponent(match[2])}` : mediaUrl;
  }

  /** Correct rows already written by an older sender/media conversion path. */
  private async repairPersistedMessage(message: UnifiedMessage): Promise<void> {
    const { data: existing, error: lookupError } = await supabase
      .from('messages')
      .select('id, chat_id, metadata')
      .eq('user_id', message.userId)
      .eq('platform_message_id', message.platformMessageId)
      .maybeSingle();
    if (lookupError || !existing) return;

    const metadata = {
      ...((existing.metadata && typeof existing.metadata === 'object') ? existing.metadata : {}),
      ...(message.platformMetadata || {}),
    };
    const mediaInfo = message.platformMetadata?.mediaInfo as { mimetype?: string } | undefined;
    const contact = this.userMapper.ghostUserToPlatformContact(message.senderId);
    let contactId: string | null = null;
    if (!message.isFromMe && contact) {
      const { data: contactRow } = await supabase
        .from('contacts')
        .select('id')
        .eq('user_id', message.userId)
        .eq('platform', message.platform)
        .eq('platform_contact_id', contact.platformContactId)
        .maybeSingle();
      contactId = contactRow?.id || null;
    }
    const { error } = await supabase
      .from('messages')
      .update({
        from_me: message.isFromMe,
        contact_name: message.isFromMe ? null : (message.senderName || null),
        contact_phone: message.isFromMe ? null : (contact?.platformContactId || null),
        contact_id: contactId,
        is_group: message.chatType === 'group',
        type: message.contentType,
        content_type: message.contentType,
        metadata,
        media_url: this.mediaProxyPath(message.platformMetadata?.mediaUrl),
        media_mime_type: mediaInfo?.mimetype || null,
      })
      .eq('id', existing.id);
    if (error) this.log('warn', `Failed to repair Matrix message ${message.platformMessageId}`, { error });
    else {
      const { error: chatError } = await supabase
        .from('chats')
        .update({
          is_group: message.chatType === 'group',
          name: message.chatName || message.chatId,
        })
        .eq('id', existing.chat_id);
      if (chatError) this.log('warn', `Failed to repair Matrix chat for ${message.platformMessageId}`, { error: chatError });
    }
  }

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

    // One-time recovery for sessions created before an OAuth profile was
    // repaired. This is deliberately opt-in and only adopts orphaned
    // connected sessions when production has exactly one application user.
    await this.repairOrphanedSessions();

    // Register all existing rooms so messages can be routed to correct sessions
    await this.registerExistingRooms();

    // Sync contacts from Matrix room members into the database
    for (const [sessionId] of this.sessionPlatforms) {
      await this.syncContacts(sessionId);
    }

    // Backfill recent history for any already-connected sessions. Contacts
    // are synced first so the repair path can attach avatar-bearing contacts
    // to historic messages in the same pass.
    await this.backfillRestoredSessions();

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
    this.sessionMatrixUserIds.clear();
    this.localSentEventIds.clear();
    this.roomMapper.clearCache();

    this.log('info', 'Matrix bridge adapter shutdown complete');
  }

  /**
   * Setup Matrix event handlers for incoming messages
   */
  private setupMatrixEventHandlers(): void {
    if (!this.matrixClient) return;

    // Auto-accept room invites from bridge bots
    this.matrixClient.on(RoomMemberEvent.Membership, async (_event, member) => {
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
      const eventId = event.getId();

      // Skip events we sent ourselves (avoids echo loops).
      // When double-puppeting is disabled we use the simpler sender check.
      // When double-puppeting is enabled the bridge may send events as the bot user
      // (originating from the user's phone) — we must NOT skip those; instead we
      // rely on localSentEventIds to filter only our own SDK-originated sends.
      if (this.doublePuppetEnabled) {
        if (eventId && this.localSentEventIds.has(eventId)) return;
      } else {
        if (sender === this.matrixClient!.getUserId()) return;
      }

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

      const selfGhostIds = this.getSelfGhostIds(chatInfo.sessionId, session, chatInfo.platform);
      const matrixUserId = this.doublePuppetEnabled
        ? this.sessionMatrixUserIds.get(chatInfo.sessionId)
        : undefined;
      const unifiedMessage = await this.eventConverter.toUnifiedMessage(
        event,
        room,
        chatInfo.sessionId,
        session.userId,
        chatInfo.platform,
        selfGhostIds,
        matrixUserId
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
      // Track real Matrix user ID for double-puppeting
      if (this.doublePuppetEnabled) {
        const matrixUserId = this.matrixClient?.getUserId();
        if (matrixUserId) {
          this.sessionMatrixUserIds.set(sessionId, matrixUserId);
          (session as any).matrixUserId = matrixUserId;
          this.log('info', `Double-puppeting enabled for session ${sessionId} as ${matrixUserId}`);
        }
      }
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

    const matchingSession = this.sessions.get(matchingSessionId);
    if (!matchingSession) return;
    const selfGhostIds = this.getSelfGhostIds(matchingSessionId, matchingSession, platform);

    // For group rooms use room.roomId as stable chatId to avoid collision with DMs.
    // Exclude the self ghost user (present in groups but not DMs) to avoid false positives.
    // Strategy: prefer phone-based contacts for counting (ignore LID duplicates of the same person).
    // If ALL contacts are LID-based (mautrix v2 all-LID group), fall back to counting LID contacts.
    const allGhostContacts = room.getJoinedMembers()
      .filter(m => !this.userMapper.isBridgeBot(m.userId) && !selfGhostIds.includes(m.userId))
      .map(m => this.userMapper.ghostUserToPlatformContact(m.userId))
      .filter((c): c is NonNullable<typeof c> => c !== null && c.platform === platform);

    const phoneContacts = allGhostContacts.filter(c => !c.platformContactId.startsWith('lid-'));
    const contactsForCounting = phoneContacts.length > 0 ? phoneContacts : allGhostContacts;
    const isGroup = contactsForCounting.length > 1;
    const chatId = isGroup ? room.roomId : this.roomMapper.getPrimaryChatParticipant(room, selfGhostIds);
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
      ...(( config as unknown as Record<string, unknown> )?.phoneNumber ? { phoneNumber: ( config as unknown as Record<string, unknown> ).phoneNumber as string } : {}),
      ...(( config as unknown as Record<string, unknown> )?.skipBridgeAuth ? { skipBridgeAuth: true } : {}),
    };

    // Initiate auth flow
    if (!(bridgeConfig as Record<string, unknown>).skipBridgeAuth) {
      await this.bridgeAuthManager.initiateAuth(
        this.matrixClient,
        controlRoom.roomId,
        platform,
        sessionId,
        bridgeConfig
      );
    }

    session.status = PlatformStatus.AWAITING_AUTH;
    await this.saveSessionToRedis(session);

    return session;
  }

  async setSessionAuthData(
    sessionId: string,
    authData: PlatformSession['authData'],
    status: PlatformStatus = PlatformStatus.AWAITING_AUTH
  ): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error('Session not found');
    session.authData = authData;
    session.status = status;
    await this.saveSessionToRedis(session);
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
    const sessions = new Map<string, PlatformSession>();

    for (const session of this.sessions.values()) {
      if (session.userId === userId) {
        sessions.set(session.id, session);
      }
    }

    // A status request must remain accurate after a server restart. The
    // in-memory map only contains sessions restored during initialization,
    // while Redis is the durable session source for every connection state.
    for (const key of await this.getAllSessionKeys()) {
      const sessionId = key.replace(this.sessionPrefix, '');
      if (sessions.has(sessionId)) continue;

      const session = await this.loadSessionFromRedis(sessionId);
      if (!session || session.userId !== userId) continue;

      sessions.set(session.id, session);
      this.sessions.set(session.id, session);
      const platform = (session as PlatformSession & { platform?: Platform }).platform;
      if (platform) {
        this.sessionPlatforms.set(session.id, platform);
      }
    }

    const userSessions = [...sessions.values()];

    // Old versions persisted a session before confirming Instagram
    // provisioning was reachable. Retire those stale attempts as well as
    // abandoned current attempts; a new connection can always start fresh.
    await Promise.all(userSessions.map(async (session) => {
      const platform = (session as PlatformSession & { platform?: Platform }).platform;
      const isPending = session.status === PlatformStatus.INITIALIZING
        || session.status === PlatformStatus.AWAITING_AUTH
        || session.status === PlatformStatus.AUTHENTICATING
        || session.status === PlatformStatus.RECONNECTING;
      const ageMs = Date.now() - new Date(session.createdAt).getTime();

      if (platform === Platform.INSTAGRAM && isPending && ageMs > MatrixBridgeAdapter.INSTAGRAM_AUTH_EXPIRY_MS) {
        await this.markSessionFailed(
          session.id,
          'Instagram sign-in expired. Start a new connection to try again.'
        );
      }
    }));

    return userSessions;
  }

  /**
   * Disconnect a session
   */
  /**
   * Mark a session as connected after successful bridge HTTP API login.
   * Replicates the logic in handleControlRoomMessage for the login-success case.
   */
  async markSessionConnected(sessionId: string, platformUserId?: string): Promise<void> {
    const session = this.sessions.get(sessionId) || await this.loadSessionFromRedis(sessionId);
    if (!session) return;

    session.status = PlatformStatus.CONNECTED;
    session.lastConnectedAt = new Date();
    if (platformUserId) {
      session.platformUserId = platformUserId;
    }

    const platform = this.sessionPlatforms.get(sessionId);
    if (platformUserId && platform) {
      // Provisioning can return a WhatsApp phone/LID JID rather than the
      // Matrix ghost localpart. Persist the canonical derived alias; the full
      // exact alias set remains available through getSelfGhostIds().
      const selfGhostId = this.userMapper.selfGhostUserIds(platform, platformUserId)[0];
      if (selfGhostId) {
        this.sessionSelfGhostIds.set(sessionId, selfGhostId);
        session.selfGhostId = selfGhostId;
      }
    }

    // Track real Matrix user ID for double-puppeting
    if (this.doublePuppetEnabled) {
      const matrixUserId = this.matrixClient?.getUserId();
      if (matrixUserId) {
        this.sessionMatrixUserIds.set(sessionId, matrixUserId);
        session.matrixUserId = matrixUserId;
      }
    }

    this.sessions.set(sessionId, session);
    if (platform) {
      await this.resolveAndPersistSelfGhostIds(sessionId, session, platform);
    }
    await this.saveSessionToRedis(session);
    this.bridgeAuthManager.markAuthenticated(sessionId);
    this.emitPlatformEvent('session_ready', sessionId, {});

    if (platform) {
      await this.registerExistingRooms();
      await this.syncRoomHistory(sessionId, platform);
      await this.syncContacts(sessionId);
    }
  }

  async markSessionFailed(sessionId: string, error: string): Promise<void> {
    const session = this.sessions.get(sessionId) || await this.loadSessionFromRedis(sessionId);
    if (!session) return;

    session.status = PlatformStatus.FAILED;
    session.error = error;
    this.sessions.set(sessionId, session);
    await this.saveSessionToRedis(session);
    this.bridgeAuthManager.markFailed(sessionId, error);
    this.emitPlatformEvent('auth_failure', sessionId, { error });
  }

  async disconnectSession(sessionId: string): Promise<void> {
    const platform = this.sessionPlatforms.get(sessionId);
    const controlRoom = platform
      ? await this.getOrRestoreControlRoom(sessionId, platform)
      : undefined;

    if (controlRoom && this.matrixClient) {
      // Send logout command to bridge
      await this.bridgeAuthManager.logout(this.matrixClient, sessionId);
    }

    // Clean up
    this.sessionControlRooms.delete(sessionId);
    this.sessionPlatforms.delete(sessionId);
    this.sessionSelfGhostIds.delete(sessionId);
    this.sessionMatrixUserIds.delete(sessionId);

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
    const controlRoom = await this.getOrRestoreControlRoom(sessionId, platform);
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

  /** Restore the control-room mapping for a session loaded from Redis. */
  private async getOrRestoreControlRoom(sessionId: string, platform: Platform): Promise<string | undefined> {
    const existing = this.sessionControlRooms.get(sessionId);
    if (existing) return existing;
    if (!this.matrixClient) return undefined;

    const bridgeBotUserId = `@${BRIDGE_BOT_LOCALPARTS[platform]}:${this.config.serverName}`;
    const controlRoom = await this.findOrCreateControlRoom(bridgeBotUserId);
    this.sessionControlRooms.set(sessionId, controlRoom.roomId);
    return controlRoom.roomId;
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
    let roomId: string;

    // Check if chatId is already a Matrix room ID (starts with !)
    if (chatId.startsWith('!') && chatId.includes(':')) {
      this.log('warn', `Using chatId as room ID directly: ${chatId} (should be fixed in database)`);
      roomId = chatId;
    } else {
      // Normal case: look up room by platform contact ID
      const foundRoomId = await this.roomMapper.findRoomForChat(
        this.matrixClient,
        platform,
        chatId
      );

      if (!foundRoomId) {
        throw new Error(`No Matrix room found for platform ${platform} chat ${chatId}`);
      }

      roomId = foundRoomId;
    }

    // Send the message
    let eventId: string;

    if (message.media && message.media.length > 0) {
      // Upload and send media
      const media = message.media[0];
      // A `Buffer` is a `Uint8Array` at runtime, but @types/node parameterises
      // it on `ArrayBufferLike`, which no longer satisfies the DOM
      // `BufferSource` the SDK asks for. Re-wrap the bytes as a plain
      // `Uint8Array` backed by its own `ArrayBuffer`.
      const uploaded = await this.matrixClient.uploadContent(
        new Uint8Array(media.data as Buffer),
        { type: media.mimeType },
      );

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

    // Track this event ID so we don't echo it back as an incoming message
    // when double-puppeting is enabled (the bridge will relay it back as the bot user).
    if (this.doublePuppetEnabled && eventId) {
      this.localSentEventIds.add(eventId);
      // Prune old IDs to prevent unbounded growth (keep last 1000)
      if (this.localSentEventIds.size > 1000) {
        const oldest = this.localSentEventIds.values().next().value;
        if (oldest) this.localSentEventIds.delete(oldest);
      }
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
    const selfGhostIds = this.getSelfGhostIds(sessionId, session, platform);

    for (const room of rooms) {
      if (this.roomMapper.detectRoomPlatform(room) !== platform) continue;

      const members = room.getJoinedMembers();
      for (const member of members) {
        if (this.userMapper.isBridgeBot(member.userId)) continue;
        if (selfGhostIds.includes(member.userId)) continue;

        let displayName = member.name;
        let avatarUrl = member.getAvatarUrl(this.config.homeserverUrl, 256, 256, 'crop', false, false) || undefined;

        // Room state is not always populated for bridged ghost users. Fetch
        // the canonical Matrix profile as a fallback so contact names and
        // avatars are available to the unified Updates rail as well.
        try {
          const profile = await this.matrixClient.getProfileInfo(member.userId);
          displayName = profile.displayname || displayName;
          if (profile.avatar_url) {
            avatarUrl = this.matrixMediaProxyUrl(profile.avatar_url)
              || this.matrixClient.mxcUrlToHttp(profile.avatar_url)
              || avatarUrl;
          }
        } catch {
          // A profile lookup can fail for a stale/remote ghost; room metadata
          // remains a valid fallback.
        }

        avatarUrl = avatarUrl ? this.matrixMediaProxyUrl(avatarUrl) || avatarUrl : avatarUrl;

        const contact = this.userMapper.matrixMemberToContact(
          member.userId,
          displayName,
          avatarUrl,
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
   * Matrix media often requires the bot access token. Store an API proxy URL
   * in contacts so mobile/web clients can load profile photos without knowing
   * the Matrix token or relying on an unauthenticated Synapse media endpoint.
   */
  private matrixMediaProxyUrl(mxcUrl: string): string | undefined {
    const match = mxcUrl.match(/^mxc:\/\/([^/]+)\/(.+)$/)
      || mxcUrl.match(/\/_matrix\/(?:client\/v1\/media|media\/v3)\/(?:thumbnail|download)\/([^/]+)\/([^?]+)/);
    if (!match) return undefined;

    const apiBase = process.env.PUBLIC_API_URL
      || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : `http://localhost:${process.env.PORT || '3001'}`);
    return `${apiBase}/media/${encodeURIComponent(match[1])}/${encodeURIComponent(match[2])}`;
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

      const selfGhostIds = this.getSelfGhostIds(sessionId, session, platform);
      const chatId = this.roomMapper.getPrimaryChatParticipant(room, selfGhostIds);
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
    const selfGhostIds = this.getSelfGhostIds(sessionId, session, platform);
    const matrixUserId = this.doublePuppetEnabled
      ? this.sessionMatrixUserIds.get(sessionId)
      : undefined;

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
            selfGhostIds,
            matrixUserId
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
        if (session?.status === PlatformStatus.CONNECTED) await this.restoreConnectedSession(session);
      }

      // Connected sessions must outlive Redis' TTL. Redis remains the source
      // for active one-time login flows, while this table restores durable
      // bridge identity mappings after a redeploy or a day of inactivity.
      if (this.durableSessionStorageAvailable) {
        const { data, error } = await supabase
          .from('platform_sessions')
          .select('session_id,user_id,platform,status,platform_user_id,platform_username,phone_number,session_data,created_at,last_connected_at')
          .eq('status', PlatformStatus.CONNECTED);
        if (error) {
          this.durableSessionStorageAvailable = false;
          this.log('warn', 'Could not restore durable Matrix sessions', { error: error.message });
        } else {
          for (const row of (data || []) as PersistedMatrixSessionRow[]) {
            if (this.sessions.has(row.session_id)) continue;
            const session = fromPersistedMatrixSession(row, this.capabilities);
            if (session) await this.restoreConnectedSession(session);
          }
        }
      }

      this.log('info', `Restored ${this.sessions.size} Matrix sessions`);
    } catch (error) {
      this.log('error', 'Failed to restore Matrix sessions', { error });
    }
  }

  private async restoreConnectedSession(session: PlatformSession): Promise<void> {
    const { id: sessionId, platform, selfGhostId } = session;
    this.sessions.set(sessionId, session);
    this.sessionPlatforms.set(sessionId, platform);
    await this.resolveAndPersistSelfGhostIds(sessionId, session, platform);

    if (selfGhostId) {
      this.sessionSelfGhostIds.set(sessionId, selfGhostId);
      this.log('info', `Restored selfGhostId for session ${sessionId}: ${selfGhostId}`);
    } else {
      this.log('warn', `Session ${sessionId} missing selfGhostId - sender detection may fail`);
    }

    if (this.doublePuppetEnabled) {
      const matrixUserId = session.matrixUserId || this.matrixClient?.getUserId();
      if (matrixUserId) {
        this.sessionMatrixUserIds.set(sessionId, matrixUserId);
        this.log('info', `Restored matrixUserId for session ${sessionId}: ${matrixUserId}`);
      }
    }
    this.log('info', `Restored Matrix session: ${sessionId} (selfGhost: ${selfGhostId || 'unknown'})`);
  }

  private async repairOrphanedSessions(): Promise<void> {
    if (process.env.REPAIR_ORPHANED_MATRIX_SESSIONS !== 'true') return;

    const connectedSessions = [...this.sessions.values()].filter(
      (session) => session.status === PlatformStatus.CONNECTED,
    );
    if (connectedSessions.length === 0) return;

    const { data: users, error } = await supabase.from('users').select('id');
    if (error) {
      this.log('error', 'Could not inspect users for Matrix session repair', { error });
      return;
    }

    const userIds = new Set<string>((users || []).map((user: DbRow) => user.id as string));
    if (userIds.size !== 1) {
      this.log('warn', `Skipping orphaned Matrix session repair: expected one user, found ${userIds.size}`);
      return;
    }

    const [targetUserId] = [...userIds];
    const orphaned = connectedSessions.filter((session) => !userIds.has(session.userId));
    if (orphaned.length === 0) return;

    for (const session of orphaned) {
      session.userId = targetUserId;
      await this.saveSessionToRedis(session);
      this.log('warn', `Reassigned orphaned Matrix session ${session.id} to the sole application profile`);
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

      const platform = this.sessionPlatforms.get(sessionId);
      if (!platform) return;
      const selfGhostIds = this.getSelfGhostIds(sessionId, session, platform);
      let synced = 0;

      for (const contact of contacts) {
        // Skip the user's own ghost contact
        if (selfGhostIds.some((id) => this.userMapper.ghostUserToPlatformContact(id)?.platformContactId === contact.platformContactId)) continue;

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
    const before = this.roomMapper.getAllMappings().length;

    for (const room of rooms) {
      if (this.roomMapper.getRoomChatInfo(room.roomId)) continue; // already registered
      await this.tryRegisterRoom(room);
    }

    const registered = this.roomMapper.getAllMappings().length - before;
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

    const selfGhostIds = this.getSelfGhostIds(sessionId, session, platform);
    const matrixUserId = this.doublePuppetEnabled
      ? this.sessionMatrixUserIds.get(sessionId)
      : undefined;

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
          selfGhostIds,
          matrixUserId
        );

        unifiedMessage.platformMetadata = {
          ...(unifiedMessage.platformMetadata || {}),
          syncKind: 'backfill',
        };

        await this.repairPersistedMessage(unifiedMessage);
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
