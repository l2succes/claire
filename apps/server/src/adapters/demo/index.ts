/**
 * Demo bridge adapter
 *
 * A decorator, not a replacement. Every call it does not recognise as belonging
 * to a demo account is handed straight to the real adapter, so wrapping the
 * production Matrix adapter in this changes nothing for a real user — which is
 * why demo support can live in the same deployment as real traffic.
 *
 * It recognises demo work two ways:
 *
 *  - a session identifier minted by `demoSessionId()`, which carries its owner
 *    (so authorisation is answerable without a lookup), and
 *  - a `userId` argument belonging to an account that passes the demo gate.
 *
 * Events are left entirely to the delegate: `on`/`off` pass through, and the
 * demo side injects messages through the `ingest` callback instead. That avoids
 * a second event path — and an import cycle back through PlatformManager.
 */

import {
  AuthMethod,
  IPlatformAdapter,
  MessageContentType,
  OutgoingMessage,
  Platform,
  PlatformCapabilities,
  PlatformEvent,
  PlatformEventHandler,
  PlatformSession,
  UnifiedChat,
  UnifiedContact,
  UnifiedMessage,
} from '../types';
import {
  buildDemoChatHistory,
  buildDemoChats,
  buildDemoContacts,
  buildDemoSessions,
  demoGhostId,
  demoSessionId,
  parseDemoSessionId,
  DEMO_SELF_IDENTITY,
} from '../../demo/fixtures';
import { logger } from '../../utils/logger';

export interface DemoAdapterDeps {
  /** Injects a message into the unified ingestion path. */
  ingest: (message: UnifiedMessage) => Promise<void>;
  /** The demo gate. Resolved per call so a flag flip does not need a restart. */
  isDemoUser: (userId: string) => Promise<boolean>;
  /** Invoked after an outgoing demo message is persisted. */
  onOutgoing: (outgoing: { userId: string; platform: Platform; chatId: string; content: string }) => void;
}

export class DemoBridgeAdapter implements IPlatformAdapter {
  constructor(
    private readonly delegate: IPlatformAdapter,
    private readonly deps: DemoAdapterDeps
  ) {}

  get platform(): Platform {
    return this.delegate.platform;
  }

  get authMethod(): AuthMethod {
    return this.delegate.authMethod;
  }

  get capabilities(): PlatformCapabilities {
    return this.delegate.capabilities;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    logger.info('[demo] Demo adapter active — wrapping the real platform adapter');
    await this.delegate.initialize();
  }

  async shutdown(): Promise<void> {
    await this.delegate.shutdown();
  }

  // ── Sessions ────────────────────────────────────────────────────────────

  /**
   * A demo account already has its connections. The connect route checks for a
   * CONNECTED session before creating one, so it answers "already connected"
   * and never reaches here — meaning a demo account cannot start a real bridge
   * login by tapping Connect.
   */
  async createSession(userId: string, sessionId: string, config?: unknown): Promise<PlatformSession> {
    if (await this.deps.isDemoUser(userId)) {
      logger.info('[demo] Ignoring session creation for a demo account; returning its demo session');
      const sessions = buildDemoSessions(userId);
      return sessions.find((session) => session.platform === this.platform) ?? sessions[0];
    }
    return this.delegate.createSession(userId, sessionId, config);
  }

  async getSession(sessionId: string): Promise<PlatformSession | null> {
    const parsed = parseDemoSessionId(sessionId);
    if (parsed) {
      if (!(await this.deps.isDemoUser(parsed.userId))) {
        // A well-formed demo identifier for an account that is not a demo
        // account. Treat it as unknown rather than minting a session.
        return null;
      }
      return (
        buildDemoSessions(parsed.userId).find((session) => session.id === sessionId) ?? null
      );
    }
    return this.delegate.getSession(sessionId);
  }

  async getUserSessions(userId: string): Promise<PlatformSession[]> {
    if (await this.deps.isDemoUser(userId)) {
      return buildDemoSessions(userId);
    }
    return this.delegate.getUserSessions(userId);
  }

  async disconnectSession(sessionId: string): Promise<void> {
    if (parseDemoSessionId(sessionId)) {
      logger.info('[demo] Ignoring disconnect for a synthetic demo session');
      return;
    }
    return this.delegate.disconnectSession(sessionId);
  }

  async reconnectSession(sessionId: string): Promise<void> {
    if (parseDemoSessionId(sessionId)) return;
    return this.delegate.reconnectSession(sessionId);
  }

  async getAuthData(sessionId: string): Promise<unknown> {
    if (parseDemoSessionId(sessionId)) return { demo: true };
    return this.delegate.getAuthData(sessionId);
  }

  // ── Messaging ───────────────────────────────────────────────────────────

  /**
   * Send from a demo account.
   *
   * The real Matrix adapter does not persist its own sends — it relies on the
   * homeserver echoing the event back, and ingestion picks it up there. This
   * mirrors that: the outgoing message is injected through ingestion before the
   * call returns, so the sent bubble reaches the database and the client's
   * realtime subscription by the same route a real send would.
   */
  async sendMessage(
    sessionId: string,
    chatId: string,
    message: OutgoingMessage
  ): Promise<UnifiedMessage> {
    const parsed = parseDemoSessionId(sessionId);
    if (!parsed) {
      return this.delegate.sendMessage(sessionId, chatId, message);
    }
    if (!(await this.deps.isDemoUser(parsed.userId))) {
      throw new Error('Session not found');
    }

    const { platform, userId } = parsed;
    const platformMessageId = `demo-sent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const sent: UnifiedMessage = {
      id: platformMessageId,
      platformMessageId,
      platform,
      sessionId,
      userId,
      content: message.content,
      contentType: message.contentType ?? MessageContentType.TEXT,
      senderId: demoGhostId(platform, DEMO_SELF_IDENTITY[platform].platformUserId),
      chatId,
      chatType: chatId.includes('@g.us') || chatId.startsWith('-') ? 'group' : 'individual',
      timestamp: new Date(),
      isFromMe: true,
      isRead: true,
      hasMedia: false,
      replyToMessageId: message.replyToMessageId,
      platformMetadata: { demo: true },
    };

    await this.deps.ingest(sent);

    // Scheduled after persistence so the persona's reply can read the message
    // it is replying to out of the database.
    this.deps.onOutgoing({ userId, platform, chatId, content: message.content });

    return sent;
  }

  async sendReaction(
    sessionId: string,
    chatId: string,
    messageId: string,
    emoji: string
  ): Promise<{ platformEventId: string }> {
    if (parseDemoSessionId(sessionId)) {
      return { platformEventId: `demo-reaction-${Date.now()}` };
    }
    if (!this.delegate.sendReaction) {
      throw new Error('Platform does not support reactions');
    }
    return this.delegate.sendReaction(sessionId, chatId, messageId, emoji);
  }

  async markAsRead(sessionId: string, chatId: string, messageId: string): Promise<void> {
    if (parseDemoSessionId(sessionId)) return;
    return this.delegate.markAsRead(sessionId, chatId, messageId);
  }

  // ── Contacts & chats ────────────────────────────────────────────────────

  async getContacts(sessionId: string): Promise<UnifiedContact[]> {
    const parsed = parseDemoSessionId(sessionId);
    if (!parsed) return this.delegate.getContacts(sessionId);
    return buildDemoContacts(parsed.userId).filter(
      (contact) => contact.platform === parsed.platform
    );
  }

  async getChats(sessionId: string): Promise<UnifiedChat[]> {
    const parsed = parseDemoSessionId(sessionId);
    if (!parsed) return this.delegate.getChats(sessionId);
    return buildDemoChats(parsed.userId).filter((chat) => chat.platform === parsed.platform);
  }

  async getChatHistory(sessionId: string, chatId: string, limit = 50): Promise<UnifiedMessage[]> {
    const parsed = parseDemoSessionId(sessionId);
    if (!parsed) return this.delegate.getChatHistory(sessionId, chatId, limit);
    return buildDemoChatHistory(chatId, parsed.userId).slice(-limit);
  }

  // ── Events ──────────────────────────────────────────────────────────────
  //
  // Pass-through by design. Demo messages arrive via `ingest`, so there is
  // exactly one event path in the process and no risk of double delivery.

  on(event: PlatformEvent, handler: PlatformEventHandler): void {
    this.delegate.on(event, handler);
  }

  off(event: PlatformEvent, handler: PlatformEventHandler): void {
    this.delegate.off(event, handler);
  }
}

export { demoSessionId };
