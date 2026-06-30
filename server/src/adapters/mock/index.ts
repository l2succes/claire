/**
 * Mock Bridge Adapter
 *
 * Used when MOCK_BRIDGE=true. Replaces all real platform adapters with a
 * fake adapter that emits deterministic scripted messages so the server
 * can boot with zero Docker/Matrix/WhatsApp dependency.
 *
 * On initialize() it emits the MOCK_MESSAGES fixture set after a short
 * delay, so the unified message handler has time to register first.
 */

import { EventEmitter } from 'events';
import {
  IPlatformAdapter,
  Platform,
  AuthMethod,
  PlatformCapabilities,
  PlatformSession,
  PlatformStatus,
  UnifiedMessage,
  UnifiedContact,
  UnifiedChat,
  OutgoingMessage,
  PlatformEvent,
  PlatformEventHandler,
  PlatformEventData,
  MessageContentType,
} from '../types';
import {
  MOCK_USER_ID,
  MOCK_SESSION_ID,
  MOCK_MESSAGES,
  MOCK_CHATS,
  MOCK_CONTACTS,
} from '../../mock-fixtures';
import { logger } from '../../utils/logger';

const MOCK_CAPABILITIES: PlatformCapabilities = {
  canSendText: true,
  canSendMedia: false,
  canSendStickers: false,
  canSendVoice: false,
  canSendLocation: false,
  canCreateGroups: false,
  canReadReceipts: true,
  canEditMessages: false,
  canDeleteMessages: false,
  canReactToMessages: false,
  canReplyToMessages: true,
  maxMessageLength: 4096,
  supportedMediaTypes: [MessageContentType.TEXT],
};

export class MockBridgeAdapter extends EventEmitter implements IPlatformAdapter {
  readonly platform: Platform = Platform.WHATSAPP; // nominal; manager registers for all platforms
  readonly authMethod: AuthMethod = AuthMethod.QR_CODE;
  readonly capabilities: PlatformCapabilities = MOCK_CAPABILITIES;

  private mockSession: PlatformSession = {
    id: MOCK_SESSION_ID,
    platform: Platform.WHATSAPP,
    userId: MOCK_USER_ID,
    status: PlatformStatus.CONNECTED,
    authMethod: AuthMethod.QR_CODE,
    createdAt: new Date('2026-06-28T10:00:00Z'),
    capabilities: MOCK_CAPABILITIES,
  };

  private sentMessages: UnifiedMessage[] = [];

  async initialize(): Promise<void> {
    logger.info('[MockBridge] Initializing mock bridge adapter...');

    // Emit session_ready so any session listeners are satisfied
    const readyEvent: PlatformEventData = {
      sessionId: MOCK_SESSION_ID,
      platform: Platform.WHATSAPP,
      event: 'session_ready',
      data: this.mockSession,
      timestamp: new Date(),
    };
    this.emit('session_ready', readyEvent);

    // Emit scripted messages after a tick so handler is registered
    setImmediate(() => {
      logger.info(`[MockBridge] Replaying ${MOCK_MESSAGES.length} fixture messages...`);
      for (const msg of MOCK_MESSAGES) {
        const eventData: PlatformEventData = {
          sessionId: MOCK_SESSION_ID,
          platform: msg.platform,
          event: 'message',
          data: msg,
          timestamp: new Date(),
        };
        this.emit('message', eventData);
      }
      logger.info('[MockBridge] Fixture replay complete');
    });

    logger.info('[MockBridge] Mock bridge adapter initialized');
  }

  async shutdown(): Promise<void> {
    logger.info('[MockBridge] Shutting down mock bridge adapter');
    this.removeAllListeners();
  }

  async createSession(userId: string, sessionId: string): Promise<PlatformSession> {
    const session: PlatformSession = {
      ...this.mockSession,
      id: sessionId,
      userId,
    };
    return session;
  }

  async getSession(sessionId: string): Promise<PlatformSession | null> {
    if (sessionId === MOCK_SESSION_ID) {
      return this.mockSession;
    }
    return null;
  }

  async getUserSessions(userId: string): Promise<PlatformSession[]> {
    if (userId === MOCK_USER_ID) {
      return [this.mockSession];
    }
    return [];
  }

  async disconnectSession(_sessionId: string): Promise<void> {
    // no-op
  }

  async reconnectSession(_sessionId: string): Promise<void> {
    // no-op
  }

  async getAuthData(_sessionId: string): Promise<unknown> {
    return { mock: true };
  }

  async sendMessage(
    sessionId: string,
    chatId: string,
    message: OutgoingMessage
  ): Promise<UnifiedMessage> {
    const sent: UnifiedMessage = {
      id: `mock-sent-${Date.now()}`,
      platformMessageId: `mock-sent-${Date.now()}`,
      platform: Platform.WHATSAPP,
      sessionId,
      userId: MOCK_USER_ID,
      content: message.content,
      contentType: message.contentType ?? MessageContentType.TEXT,
      senderId: MOCK_USER_ID,
      chatId,
      chatType: 'individual',
      timestamp: new Date(),
      isFromMe: true,
      isRead: false,
      hasMedia: false,
    };
    this.sentMessages.push(sent);
    logger.debug(`[MockBridge] sendMessage to ${chatId}: "${message.content}"`);
    return sent;
  }

  async markAsRead(_sessionId: string, _chatId: string, _messageId: string): Promise<void> {
    // no-op
  }

  async getContacts(_sessionId: string): Promise<UnifiedContact[]> {
    return MOCK_CONTACTS;
  }

  async getChats(_sessionId: string): Promise<UnifiedChat[]> {
    return MOCK_CHATS;
  }

  async getChatHistory(
    _sessionId: string,
    chatId: string,
    limit = 50
  ): Promise<UnifiedMessage[]> {
    return MOCK_MESSAGES
      .filter((m) => m.chatId === chatId)
      .slice(-limit);
  }

  /** Return messages sent via sendMessage during this session (for test assertions) */
  getSentMessages(): UnifiedMessage[] {
    return [...this.sentMessages];
  }

  on(event: PlatformEvent, handler: PlatformEventHandler): this {
    return super.on(event, handler);
  }

  off(event: PlatformEvent, handler: PlatformEventHandler): this {
    return super.off(event, handler);
  }
}

// Singleton for the mock run
export const mockBridgeAdapter = new MockBridgeAdapter();
