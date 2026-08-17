/**
 * Instagram Platform Adapter
 *
 * Implements the IPlatformAdapter interface for Instagram DMs using instagram-private-api.
 * WARNING: This uses an unofficial API and may violate Instagram ToS.
 */

import { BasePlatformAdapter } from '../base-adapter';
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

export interface InstagramConfig {
  username: string;
  password: string;
}

export class InstagramAdapter extends BasePlatformAdapter {
  readonly platform = Platform.INSTAGRAM;
  readonly authMethod = AuthMethod.USERNAME_PASSWORD;
  readonly capabilities: PlatformCapabilities = {
    canSendText: true,
    canSendMedia: true,
    canSendStickers: false,
    canSendVoice: true,
    canSendLocation: false,
    canCreateGroups: true,
    canReadReceipts: true,
    canEditMessages: false,
    canDeleteMessages: true,
    canReactToMessages: true,
    canReplyToMessages: true,
    maxMessageLength: 1000,
    supportedMediaTypes: [
      MessageContentType.IMAGE,
      MessageContentType.VIDEO,
      MessageContentType.VOICE,
      MessageContentType.STORY_REPLY,
    ],
  };

  private clients: Map<string, unknown> = new Map();
  private pollingIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();

  async initialize(): Promise<void> {
    this.log('info', 'Instagram adapter initializing...');
    this.log('warn', 'Instagram adapter uses unofficial API - use at your own risk');
    await this.restoreExistingSessions();
    this.log('info', 'Instagram adapter initialized');
  }

  async shutdown(): Promise<void> {
    this.log('info', 'Instagram adapter shutting down...');

    for (const [sessionId, interval] of this.pollingIntervals) {
      clearInterval(interval);
      this.log('info', `Polling stopped for session ${sessionId}`);
    }

    this.pollingIntervals.clear();
    this.clients.clear();
    this.sessions.clear();
    this.log('info', 'Instagram adapter shutdown complete');
  }

  async createSession(
    userId: string,
    sessionId: string,
    config?: unknown
  ): Promise<PlatformSession> {
    const instagramConfig = config as InstagramConfig;

    if (!instagramConfig?.username || !instagramConfig?.password) {
      throw new Error('Username and password are required for Instagram');
    }

    const session = this.createDefaultSession(userId, sessionId);
    session.status = PlatformStatus.AUTHENTICATING;
    this.sessions.set(sessionId, session);

    try {
      // Dynamic import of instagram-private-api
      let IgApiClient: typeof import('instagram-private-api').IgApiClient;
      try {
        const igModule = await import('instagram-private-api');
        IgApiClient = igModule.IgApiClient;
      } catch {
        throw new Error('instagram-private-api not installed. Run: bun add instagram-private-api');
      }

      const ig = new IgApiClient();
      ig.state.generateDevice(instagramConfig.username);

      // Simulate real device behavior
      await ig.simulate.preLoginFlow();

      // Login
      const loggedInUser = await ig.account.login(
        instagramConfig.username,
        instagramConfig.password
      );

      // Post-login simulation
      await ig.simulate.postLoginFlow();

      this.clients.set(sessionId, ig);

      session.platformUserId = loggedInUser.pk.toString();
      session.platformUsername = loggedInUser.username;
      session.status = PlatformStatus.CONNECTED;
      session.lastConnectedAt = new Date();

      // Store serialized state for reconnection (not credentials)
      const state = await ig.state.serialize();
      delete (state as Record<string, unknown>).constants;
      session.authData = { state };

      await this.saveSessionToRedis(session);

      // Start polling for new messages
      this.startMessagePolling(sessionId, userId, ig);

      this.emitPlatformEvent('session_ready', sessionId, {
        username: loggedInUser.username,
      });

      this.log('info', `Instagram connected: @${loggedInUser.username}`);

      return session;
    } catch (error: unknown) {
      session.status = PlatformStatus.FAILED;

      const err = error as { name?: string; message?: string };

      // Handle specific Instagram errors
      if (err.name === 'IgCheckpointError') {
        session.error = 'Instagram requires verification. Please check your email or phone.';
      } else if (err.name === 'IgLoginBadPasswordError') {
        session.error = 'Invalid password';
      } else if (err.name === 'IgLoginInvalidUserError') {
        session.error = 'Invalid username';
      } else {
        session.error = err.message || 'Unknown error';
      }

      await this.saveSessionToRedis(session);
      this.emitPlatformEvent('auth_failure', sessionId, { error: session.error });
      throw error;
    }
  }

  private startMessagePolling(
    sessionId: string,
    userId: string,
    ig: import('instagram-private-api').IgApiClient
  ): void {
    // Poll for new messages every 10 seconds
    const interval = setInterval(async () => {
      try {
        await this.checkForNewMessages(sessionId, userId, ig);
      } catch (error) {
        this.log('error', `Error polling Instagram messages for ${sessionId}`, { error });
      }
    }, 10000);

    this.pollingIntervals.set(sessionId, interval);
  }

  private async checkForNewMessages(
    sessionId: string,
    userId: string,
    ig: import('instagram-private-api').IgApiClient
  ): Promise<void> {
    try {
      const inbox = ig.feed.directInbox();
      const threads = await inbox.items();

      for (const thread of threads) {
        // Use type assertion to handle API type mismatch - oldest_cursor is optional in practice
        const threadFeed = ig.feed.directThread({ thread_id: thread.thread_id, oldest_cursor: '' } as Parameters<typeof ig.feed.directThread>[0]);
        const messages = await threadFeed.items();

        for (const msg of messages) {
          // Only process recent messages (last 60 seconds)
          const msgRecord = msg as unknown as Record<string, unknown>;
          const msgTime = new Date((msgRecord.timestamp as number) / 1000);
          const now = new Date();
          if (now.getTime() - msgTime.getTime() < 60000) {
            const unifiedMessage = this.convertToUnifiedMessage(
              msgRecord,
              thread as unknown as Record<string, unknown>,
              sessionId,
              userId
            );
            this.emitPlatformEvent('message', sessionId, unifiedMessage);
          }
        }
      }
    } catch (error) {
      this.log('error', 'Error checking Instagram messages', { error });
    }
  }

  private convertToUnifiedMessage(
    msg: Record<string, unknown>,
    thread: Record<string, unknown>,
    sessionId: string,
    userId: string
  ): UnifiedMessage {
    let content = '';
    let contentType = MessageContentType.TEXT;

    const itemType = msg.item_type as string;

    if (itemType === 'text') {
      content = (msg.text as string) || '';
    } else if (itemType === 'media_share') {
      content = '[Shared post]';
      contentType = MessageContentType.IMAGE;
    } else if (itemType === 'voice_media') {
      content = '[Voice message]';
      contentType = MessageContentType.VOICE;
    } else if (itemType === 'raven_media') {
      content = '[Disappearing photo/video]';
      contentType = MessageContentType.IMAGE;
    } else if (itemType === 'story_share') {
      content = '[Story reply]';
      contentType = MessageContentType.STORY_REPLY;
    }

    const session = this.sessions.get(sessionId);
    const msgUserId = (msg.user_id as number)?.toString();
    const isFromMe = msgUserId === session?.platformUserId;

    const users = (thread.users as Array<{ pk: number; username: string }>) || [];
    const sender = users.find((u) => u.pk.toString() === msgUserId);

    return {
      id: `ig-${msg.item_id}-${Date.now()}`,
      platformMessageId: msg.item_id as string,
      platform: Platform.INSTAGRAM,
      sessionId,
      userId,
      content,
      contentType,
      senderId: msgUserId || 'unknown',
      senderName: sender?.username,
      chatId: thread.thread_id as string,
      chatType: users.length > 1 ? 'group' : 'individual',
      chatName: (thread.thread_title as string) || undefined,
      timestamp: new Date((msg.timestamp as number) / 1000),
      isFromMe,
      isRead: (msg.is_seen as boolean) || false,
      hasMedia: ['media_share', 'voice_media', 'raven_media'].includes(itemType),
      replyToMessageId: (msg.replied_to_message as { item_id?: string })?.item_id,
      platformMetadata: {
        itemType,
        threadId: thread.thread_id,
      },
    };
  }

  async getSession(sessionId: string): Promise<PlatformSession | null> {
    const cachedSession = this.sessions.get(sessionId);
    if (cachedSession) {
      return cachedSession;
    }

    const session = await this.loadSessionFromRedis(sessionId);
    if (session) {
      this.sessions.set(sessionId, session);
    }
    return session;
  }

  async getUserSessions(userId: string): Promise<PlatformSession[]> {
    const sessions: PlatformSession[] = [];
    for (const session of this.sessions.values()) {
      if (session.userId === userId) {
        sessions.push(session);
      }
    }
    return sessions;
  }

  async disconnectSession(sessionId: string): Promise<void> {
    const interval = this.pollingIntervals.get(sessionId);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(sessionId);
    }

    this.clients.delete(sessionId);

    await this.updateSessionStatus(sessionId, PlatformStatus.DISCONNECTED);
    this.emitPlatformEvent('session_disconnected', sessionId, {});
  }

  async reconnectSession(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session || !session.authData?.state) {
      throw new Error('Cannot reconnect: session or state not found');
    }

    try {
      let IgApiClient: typeof import('instagram-private-api').IgApiClient;
      try {
        const igModule = await import('instagram-private-api');
        IgApiClient = igModule.IgApiClient;
      } catch {
        throw new Error('instagram-private-api not installed');
      }

      const ig = new IgApiClient();
      await ig.state.deserialize(session.authData.state);

      this.clients.set(sessionId, ig);
      session.status = PlatformStatus.CONNECTED;
      session.lastConnectedAt = new Date();
      await this.saveSessionToRedis(session);

      this.startMessagePolling(sessionId, session.userId, ig);
      this.emitPlatformEvent('session_ready', sessionId, {});

      this.log('info', `Instagram session reconnected: ${sessionId}`);
    } catch (error) {
      session.status = PlatformStatus.FAILED;
      session.error = (error as Error).message;
      await this.saveSessionToRedis(session);
      throw error;
    }
  }

  async getAuthData(sessionId: string): Promise<unknown> {
    const session = await this.getSession(sessionId);
    return {
      method: 'username_password',
      instructions: 'Provide your Instagram username and password',
      status: session?.status,
      warnings: [
        'This uses an unofficial API and may violate Instagram ToS',
        'Instagram may require additional verification',
        'Your account could be temporarily restricted',
        'Use at your own risk',
      ],
    };
  }

  async sendMessage(
    sessionId: string,
    chatId: string,
    message: OutgoingMessage
  ): Promise<UnifiedMessage> {
    const ig = this.clients.get(sessionId) as
      | import('instagram-private-api').IgApiClient
      | undefined;
    const session = this.sessions.get(sessionId);

    if (!ig || !session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const thread = ig.entity.directThread(chatId);
    let broadcastResult: unknown;

    if (message.media && message.media.length > 0) {
      const media = message.media[0];
      if (media.type === MessageContentType.IMAGE) {
        broadcastResult = await thread.broadcastPhoto({
          file: media.data as Buffer,
        });
      } else if (media.type === MessageContentType.VOICE) {
        broadcastResult = await thread.broadcastVoice({
          file: media.data as Buffer,
        });
      } else {
        broadcastResult = await thread.broadcastText(message.content);
      }
    } else {
      broadcastResult = await thread.broadcastText(message.content);
    }

    // Extract item_id from the response (may be in payload or directly on result)
    const resultObj = broadcastResult as Record<string, unknown>;
    const payload = resultObj.payload as Record<string, unknown> | undefined;
    const itemId = (payload?.item_id || resultObj.item_id || `${Date.now()}`) as string;

    return {
      id: `ig-${itemId}-${Date.now()}`,
      platformMessageId: itemId,
      platform: Platform.INSTAGRAM,
      sessionId,
      userId: session.userId,
      content: message.content,
      contentType: message.contentType || MessageContentType.TEXT,
      senderId: session.platformUserId!,
      chatId,
      chatType: 'individual',
      timestamp: new Date(),
      isFromMe: true,
      isRead: true,
      hasMedia: !!message.media?.length,
    };
  }

  async markAsRead(sessionId: string, chatId: string, messageId: string): Promise<void> {
    const ig = this.clients.get(sessionId) as
      | import('instagram-private-api').IgApiClient
      | undefined;
    if (!ig) return;

    try {
      const thread = ig.entity.directThread(chatId);
      await thread.markItemSeen(messageId);
    } catch (error) {
      this.log('error', 'Error marking Instagram message as read', { error });
    }
  }

  async getContacts(sessionId: string): Promise<UnifiedContact[]> {
    const ig = this.clients.get(sessionId) as
      | import('instagram-private-api').IgApiClient
      | undefined;
    const session = this.sessions.get(sessionId);

    if (!ig || !session) return [];

    try {
      const inbox = ig.feed.directInbox();
      const threads = await inbox.items();

      const contacts: UnifiedContact[] = [];
      const seenIds = new Set<string>();

      for (const thread of threads) {
        for (const user of (thread.users as Array<{
          pk: number;
          full_name: string;
          username: string;
          profile_pic_url: string;
          is_verified: boolean;
        }>) || []) {
          const pk = user.pk.toString();
          if (!seenIds.has(pk)) {
            seenIds.add(pk);
            contacts.push({
              id: `ig-contact-${pk}`,
              platformContactId: pk,
              platform: Platform.INSTAGRAM,
              userId: session.userId,
              displayName: user.full_name,
              username: user.username,
              avatarUrl: user.profile_pic_url,
              isBlocked: false,
              isVerified: user.is_verified || false,
            });
          }
        }
      }

      return contacts;
    } catch (error) {
      this.log('error', 'Error getting Instagram contacts', { error });
      return [];
    }
  }

  async getChats(sessionId: string): Promise<UnifiedChat[]> {
    const ig = this.clients.get(sessionId) as
      | import('instagram-private-api').IgApiClient
      | undefined;
    const session = this.sessions.get(sessionId);

    if (!ig || !session) return [];

    try {
      const inbox = ig.feed.directInbox();
      const threads = await inbox.items();

      return threads.map((thread) => ({
        id: `ig-chat-${thread.thread_id}`,
        platformChatId: thread.thread_id,
        platform: Platform.INSTAGRAM,
        userId: session.userId,
        name:
          (thread.thread_title as string) ||
          ((thread.users as Array<{ username: string }>) || []).map((u) => u.username).join(', '),
        isGroup: ((thread.users as unknown[]) || []).length > 1,
      }));
    } catch (error) {
      this.log('error', 'Error getting Instagram chats', { error });
      return [];
    }
  }

  async getChatHistory(
    sessionId: string,
    chatId: string,
    limit: number = 50
  ): Promise<UnifiedMessage[]> {
    const ig = this.clients.get(sessionId) as
      | import('instagram-private-api').IgApiClient
      | undefined;
    const session = this.sessions.get(sessionId);

    if (!ig || !session) return [];

    try {
      // Use type assertion to handle API type mismatch - oldest_cursor is optional in practice
      const threadFeed = ig.feed.directThread({ thread_id: chatId, oldest_cursor: '' } as Parameters<typeof ig.feed.directThread>[0]);
      const items = await threadFeed.items();

      const inbox = ig.feed.directInbox();
      const threads = await inbox.items();
      const thread = threads.find((t) => t.thread_id === chatId);

      return items
        .slice(0, limit)
        .map((msg) =>
          this.convertToUnifiedMessage(
            msg as unknown as Record<string, unknown>,
            (thread || { thread_id: chatId }) as unknown as Record<string, unknown>,
            sessionId,
            session.userId
          )
        );
    } catch (error) {
      this.log('error', 'Error getting Instagram chat history', { error });
      return [];
    }
  }

  private async restoreExistingSessions(): Promise<void> {
    const keys = await this.getAllSessionKeys();

    for (const key of keys) {
      const sessionId = key.replace(this.sessionPrefix, '');
      const session = await this.loadSessionFromRedis(sessionId);

      if (session && session.status === PlatformStatus.CONNECTED && session.authData?.state) {
        try {
          await this.reconnectSession(session.id);
          this.log('info', `Restored Instagram session: ${session.id}`);
        } catch (error) {
          this.log('error', `Failed to restore Instagram session ${session.id}`, { error });
        }
      }
    }
  }
}

// Export singleton instance
export const instagramAdapter = new InstagramAdapter();
