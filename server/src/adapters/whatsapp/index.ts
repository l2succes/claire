/**
 * WhatsApp Platform Adapter
 *
 * Implements the IPlatformAdapter interface for WhatsApp using whatsapp-web.js.
 * Provides QR code authentication, message sending/receiving, and session management.
 */

import { Client, LocalAuth, Message, GroupChat } from 'whatsapp-web.js';
import * as qrcode from 'qrcode';
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
import { whatsappConfig } from '../../config';

export class WhatsAppAdapter extends BasePlatformAdapter {
  readonly platform = Platform.WHATSAPP;
  readonly authMethod = AuthMethod.QR_CODE;
  readonly capabilities: PlatformCapabilities = {
    canSendText: true,
    canSendMedia: true,
    canSendStickers: true,
    canSendVoice: true,
    canSendLocation: true,
    canCreateGroups: true,
    canReadReceipts: true,
    canEditMessages: false,
    canDeleteMessages: true,
    canReactToMessages: true,
    canReplyToMessages: true,
    maxMessageLength: 65536,
    supportedMediaTypes: [
      MessageContentType.IMAGE,
      MessageContentType.VIDEO,
      MessageContentType.AUDIO,
      MessageContentType.VOICE,
      MessageContentType.DOCUMENT,
      MessageContentType.STICKER,
      MessageContentType.LOCATION,
      MessageContentType.CONTACT,
    ],
  };

  private clients: Map<string, Client> = new Map();

  async initialize(): Promise<void> {
    this.log('info', 'WhatsApp adapter initializing...');
    await this.restoreExistingSessions();
    this.log('info', 'WhatsApp adapter initialized');
  }

  async shutdown(): Promise<void> {
    this.log('info', 'WhatsApp adapter shutting down...');

    for (const [sessionId, client] of this.clients) {
      try {
        await client.destroy();
        this.log('info', `Session ${sessionId} destroyed`);
      } catch (error) {
        this.log('error', `Error destroying session ${sessionId}`, { error });
      }
    }

    this.clients.clear();
    this.sessions.clear();
    this.log('info', 'WhatsApp adapter shutdown complete');
  }

  async createSession(
    userId: string,
    sessionId: string,
    _config?: unknown
  ): Promise<PlatformSession> {
    if (this.clients.has(sessionId)) {
      throw new Error('Session already exists');
    }

    const session = this.createDefaultSession(userId, sessionId);
    this.sessions.set(sessionId, session);
    await this.saveSessionToRedis(session);

    const client = this.createClient(sessionId);

    this.setupClientListeners(client, sessionId);
    this.clients.set(sessionId, client);

    await client.initialize();

    return session;
  }

  private createClient(sessionId: string): Client {
    const isLinux = process.platform === 'linux';
    const puppeteerArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-crash-reporter',
      '--disable-features=VizDisplayCompositor',
      '--disable-background-networking',
      '--disable-default-apps',
      '--mute-audio',
    ];
    // --no-zygote prevents zygote process spawning on Linux containers.
    // --single-process is intentionally omitted: it's unstable and causes crashes.
    if (isLinux) puppeteerArgs.push('--no-zygote');

    this.log('info', `[whatsapp] Creating client for session ${sessionId} on ${process.platform}`);

    return new Client({
      authStrategy: new LocalAuth({
        clientId: sessionId,
        dataPath: whatsappConfig.sessionPath,
      }),
      puppeteer: {
        headless: whatsappConfig.puppeteerHeadless,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/lib/chromium/chromium',
        args: puppeteerArgs,
      },
    });
  }

  private setupClientListeners(client: Client, sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Capture page-level errors from Chrome (e.g. JS errors, crashes)
    // pupPage is available after initialize() resolves, so we hook it after a short delay
    setTimeout(() => {
      const page = (client as any).pupPage;
      if (page) {
        page.on('error', (err: Error) => {
          this.log('error', `[whatsapp] Chrome page error for ${sessionId}: ${err.message}`);
        });
        page.on('pageerror', (err: Error) => {
          this.log('error', `[whatsapp] WhatsApp Web JS error for ${sessionId}: ${err.message}`);
        });
        page.on('console', (msg: any) => {
          if (msg.type() === 'error') {
            this.log('warn', `[whatsapp] Browser console error for ${sessionId}: ${msg.text()}`);
          }
        });
        this.log('info', `[whatsapp] Page error listeners attached for ${sessionId}`);
      } else {
        this.log('warn', `[whatsapp] pupPage not available for ${sessionId} — cannot attach page listeners`);
      }
    }, 3000);

    // QR Code generation
    client.on('qr', async (qr: string) => {
      this.log('info', `[whatsapp] QR code generated for session ${sessionId} at ${new Date().toISOString()}`);

      const qrDataUrl = await qrcode.toDataURL(qr);
      session.status = PlatformStatus.AWAITING_AUTH;
      session.authData = { qrCode: qrDataUrl };
      await this.saveSessionToRedis(session);

      this.emitPlatformEvent('qr_code', sessionId, { qrCode: qrDataUrl });
    });

    // Loading screen progress
    client.on('loading_screen', (percent: number, message: string) => {
      this.log('info', `[whatsapp] Session ${sessionId} loading: ${percent}% - ${message}`);
    });

    // Authentication successful
    client.on('authenticated', async () => {
      this.log('info', `[whatsapp] ✅ Session ${sessionId} AUTHENTICATED at ${new Date().toISOString()}`);

      session.status = PlatformStatus.AUTHENTICATING;
      session.authData = { qrCode: undefined };
      await this.saveSessionToRedis(session);
    });

    // Client ready
    client.on('ready', async () => {
      this.log('info', `[whatsapp] ✅ Session ${sessionId} READY at ${new Date().toISOString()}`);

      const info = client.info;
      if (info) {
        session.phoneNumber = info.wid.user;
        session.platformUserId = info.wid._serialized;
        this.log('info', `[whatsapp] Connected as ${session.phoneNumber}`);
      }
      session.status = PlatformStatus.CONNECTED;
      session.lastConnectedAt = new Date();
      await this.saveSessionToRedis(session);

      this.emitPlatformEvent('session_ready', sessionId, {
        phoneNumber: session.phoneNumber,
      });
    });

    // Authentication failure
    client.on('auth_failure', async (msg: string) => {
      this.log('error', `[whatsapp] ❌ Auth FAILED for session ${sessionId}: ${msg}`);

      session.status = PlatformStatus.FAILED;
      session.error = msg;
      await this.saveSessionToRedis(session);

      this.emitPlatformEvent('auth_failure', sessionId, { error: msg });
    });

    // State changes
    client.on('change_state', (state: string) => {
      this.log('info', `[whatsapp] Session ${sessionId} state → ${state}`);
    });

    // Disconnection
    client.on('disconnected', async (reason: string) => {
      this.log('warn', `[whatsapp] Session ${sessionId} DISCONNECTED: ${reason}`);

      session.status = PlatformStatus.DISCONNECTED;
      session.error = reason;
      await this.saveSessionToRedis(session);

      this.emitPlatformEvent('session_disconnected', sessionId, { reason });
    });

    // Message received
    client.on('message', async (message: Message) => {
      const unifiedMessage = await this.convertToUnifiedMessage(message, sessionId, session.userId);
      this.emitPlatformEvent('message', sessionId, unifiedMessage);
    });

    // Message acknowledgment
    client.on('message_ack', async (message: Message, ack: number) => {
      this.emitPlatformEvent('message_ack', sessionId, {
        messageId: message.id._serialized,
        ack,
        status: this.ackToStatus(ack),
      });
    });
  }

  private ackToStatus(ack: number): string {
    switch (ack) {
      case 0: return 'pending';
      case 1: return 'sent';
      case 2: return 'received';
      case 3: return 'read';
      case 4: return 'played';
      default: return 'unknown';
    }
  }

  private async convertToUnifiedMessage(
    message: Message,
    sessionId: string,
    userId: string
  ): Promise<UnifiedMessage> {
    const chat = await message.getChat();
    const contact = message.fromMe ? null : await message.getContact();

    return {
      id: `wa-${message.id._serialized}-${Date.now()}`,
      platformMessageId: message.id._serialized,
      platform: Platform.WHATSAPP,
      sessionId,
      userId,
      content: message.body || '',
      contentType: this.getContentType(message.type),
      senderId: message.from,
      senderName: contact?.pushname || contact?.name,
      receiverId: message.to,
      chatId: chat.id._serialized,
      chatType: chat.isGroup ? 'group' : 'individual',
      chatName: chat.name,
      timestamp: new Date(message.timestamp * 1000),
      isFromMe: message.fromMe,
      isRead: false,
      hasMedia: message.hasMedia,
      replyToMessageId: message.hasQuotedMsg
        ? (await message.getQuotedMessage())?.id._serialized
        : undefined,
      platformMetadata: {
        type: message.type,
        isForwarded: message.isForwarded,
        isStatus: message.isStatus,
        isBroadcast: message.broadcast,
        deviceType: message.deviceType,
      },
    };
  }

  private getContentType(waType: string): MessageContentType {
    switch (waType) {
      case 'image': return MessageContentType.IMAGE;
      case 'video': return MessageContentType.VIDEO;
      case 'audio': return MessageContentType.AUDIO;
      case 'ptt': return MessageContentType.VOICE;
      case 'document': return MessageContentType.DOCUMENT;
      case 'sticker': return MessageContentType.STICKER;
      case 'location': return MessageContentType.LOCATION;
      case 'vcard': return MessageContentType.CONTACT;
      default: return MessageContentType.TEXT;
    }
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

    // Check in-memory sessions
    for (const session of this.sessions.values()) {
      if (session.userId === userId) {
        sessions.push(session);
      }
    }

    // Check Redis for any additional sessions
    const keys = await this.getAllSessionKeys();
    for (const key of keys) {
      const sessionId = key.replace(this.sessionPrefix, '');
      if (!this.sessions.has(sessionId)) {
        const session = await this.loadSessionFromRedis(sessionId);
        if (session && session.userId === userId) {
          sessions.push(session);
        }
      }
    }

    return sessions;
  }

  async disconnectSession(sessionId: string): Promise<void> {
    const client = this.clients.get(sessionId);

    if (client) {
      await client.destroy();
      this.clients.delete(sessionId);
    }

    await this.updateSessionStatus(sessionId, PlatformStatus.DISCONNECTED);
    this.emitPlatformEvent('session_disconnected', sessionId, { reason: 'manual' });
  }

  async reconnectSession(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Destroy existing client if any
    const existingClient = this.clients.get(sessionId);
    if (existingClient) {
      await existingClient.destroy();
      this.clients.delete(sessionId);
    }

    // Create new client with existing session data
    const client = this.createClient(sessionId);

    this.setupClientListeners(client, sessionId);
    this.clients.set(sessionId, client);

    session.status = PlatformStatus.RECONNECTING;
    await this.saveSessionToRedis(session);

    await client.initialize();
  }

  async getAuthData(sessionId: string): Promise<unknown> {
    const session = await this.getSession(sessionId);
    return {
      method: 'qr_code',
      qrCode: session?.authData?.qrCode,
      status: session?.status,
      instructions: 'Scan the QR code with WhatsApp on your phone',
    };
  }

  async sendMessage(
    sessionId: string,
    chatId: string,
    message: OutgoingMessage
  ): Promise<UnifiedMessage> {
    const client = this.clients.get(sessionId);
    const session = this.sessions.get(sessionId);

    if (!client || !session) {
      throw new Error('Session not found or not connected');
    }

    // Format chatId for WhatsApp
    const formattedChatId = chatId.includes('@') ? chatId : `${chatId}@c.us`;

    let sentMsg: Message;

    if (message.media && message.media.length > 0) {
      // For now, only send text. Media support can be added later.
      sentMsg = await client.sendMessage(formattedChatId, message.content);
    } else {
      sentMsg = await client.sendMessage(formattedChatId, message.content);
    }

    return this.convertToUnifiedMessage(sentMsg, sessionId, session.userId);
  }

  async markAsRead(sessionId: string, chatId: string, _messageId: string): Promise<void> {
    const client = this.clients.get(sessionId);
    if (!client) {
      throw new Error('Session not found or not connected');
    }

    const formattedChatId = chatId.includes('@') ? chatId : `${chatId}@c.us`;
    const chat = await client.getChatById(formattedChatId);
    await chat.sendSeen();
  }

  async getContacts(sessionId: string): Promise<UnifiedContact[]> {
    const client = this.clients.get(sessionId);
    const session = this.sessions.get(sessionId);

    if (!client || !session) {
      throw new Error('Session not found or not connected');
    }

    const contacts = await client.getContacts();

    return contacts.map((contact) => ({
      id: `wa-contact-${contact.id._serialized}`,
      platformContactId: contact.id._serialized,
      platform: Platform.WHATSAPP,
      userId: session.userId,
      displayName: contact.pushname || contact.name,
      phoneNumber: contact.number,
      avatarUrl: undefined, // Would need async call to get profile pic
      isBlocked: contact.isBlocked,
      isVerified: contact.isMyContact,
    }));
  }

  async getChats(sessionId: string): Promise<UnifiedChat[]> {
    const client = this.clients.get(sessionId);
    const session = this.sessions.get(sessionId);

    if (!client || !session) {
      throw new Error('Session not found or not connected');
    }

    const chats = await client.getChats();

    return chats.map((chat) => ({
      id: `wa-chat-${chat.id._serialized}`,
      platformChatId: chat.id._serialized,
      platform: Platform.WHATSAPP,
      userId: session.userId,
      name: chat.name,
      isGroup: chat.isGroup,
      participantCount: chat.isGroup ? (chat as GroupChat).participants?.length : undefined,
      unreadCount: chat.unreadCount,
      isMuted: chat.isMuted,
      isArchived: chat.archived,
      lastMessageAt: chat.timestamp ? new Date(chat.timestamp * 1000) : undefined,
    }));
  }

  async getChatHistory(
    sessionId: string,
    chatId: string,
    limit: number = 50
  ): Promise<UnifiedMessage[]> {
    const client = this.clients.get(sessionId);
    const session = this.sessions.get(sessionId);

    if (!client || !session) {
      throw new Error('Session not found or not connected');
    }

    const formattedChatId = chatId.includes('@') ? chatId : `${chatId}@c.us`;
    const chat = await client.getChatById(formattedChatId);
    const messages = await chat.fetchMessages({ limit });

    const unifiedMessages: UnifiedMessage[] = [];
    for (const msg of messages) {
      unifiedMessages.push(
        await this.convertToUnifiedMessage(msg, sessionId, session.userId)
      );
    }

    return unifiedMessages;
  }

  private async restoreExistingSessions(): Promise<void> {
    try {
      const keys = await this.getAllSessionKeys();

      for (const key of keys) {
        const sessionId = key.replace(this.sessionPrefix, '');
        const session = await this.loadSessionFromRedis(sessionId);

        if (!session) continue;

        if (session.status === PlatformStatus.CONNECTED) {
          this.sessions.set(sessionId, session);

          try {
            await this.reconnectSession(sessionId);
            this.log('info', `Restored session: ${sessionId}`);
          } catch (error) {
            this.log('error', `Failed to restore session ${sessionId}`, { error });
          }
        } else {
          // Non-connected sessions (awaiting_auth, reconnecting, etc.) can't be resumed
          // after a server restart because the Chrome process was killed. Remove them
          // so the client doesn't see stale zombie sessions.
          await this.deleteSessionFromRedis(sessionId);
          this.log('info', `Cleaned up stale session ${sessionId} (was ${session.status})`);
        }
      }

      this.log('info', `Restored ${this.sessions.size} WhatsApp sessions`);
    } catch (error) {
      this.log('error', 'Failed to restore sessions', { error });
    }
  }

  /**
   * Check if a session is connected
   */
  isSessionConnected(sessionId: string): boolean {
    const client = this.clients.get(sessionId);
    const session = this.sessions.get(sessionId);
    return !!(client && session?.status === PlatformStatus.CONNECTED);
  }

  /**
   * Get the underlying WhatsApp client for advanced operations
   */
  getClient(sessionId: string): Client | undefined {
    return this.clients.get(sessionId);
  }
}

// Export singleton instance
export const whatsappAdapter = new WhatsAppAdapter();
