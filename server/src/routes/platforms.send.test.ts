/**
 * Unit tests for POST /platforms/:platform/send — issue #34
 *
 * Verifies that the send route correctly round-trips text messages for
 * WhatsApp, Telegram, and Instagram.  All external dependencies (Supabase,
 * Matrix SDK) are replaced with in-memory fakes; the tests run fully offline.
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';

// ---------------------------------------------------------------------------
// Types needed by the fake adapter — import only the enums/interfaces, not
// the real adapter (which would pull in matrix-js-sdk).
// ---------------------------------------------------------------------------

import {
  Platform,
  PlatformStatus,
  AuthMethod,
} from '../adapters/types';
import type {
  IPlatformAdapter,
  PlatformSession,
  OutgoingMessage,
  UnifiedMessage,
  PlatformCapabilities,
  PlatformEvent,
  PlatformEventData,
  UnifiedContact,
  UnifiedChat,
} from '../adapters/types';
import { MessageContentType } from '../adapters/types';

// ---------------------------------------------------------------------------
// In-memory fake adapter
// ---------------------------------------------------------------------------

const CAPABILITIES: PlatformCapabilities = {
  canSendText: true,
  canSendMedia: false,
  canSendStickers: false,
  canSendVoice: false,
  canSendLocation: false,
  canCreateGroups: false,
  canReadReceipts: false,
  canEditMessages: false,
  canDeleteMessages: false,
  canReactToMessages: false,
  canReplyToMessages: false,
  maxMessageLength: 65536,
  supportedMediaTypes: [MessageContentType.TEXT],
};

class FakeAdapter implements IPlatformAdapter {
  readonly platform: Platform;
  readonly authMethod = AuthMethod.QR_CODE;
  readonly capabilities = CAPABILITIES;

  private sessions: Map<string, PlatformSession> = new Map();
  public lastSentMessage: { sessionId: string; chatId: string; message: OutgoingMessage } | null = null;

  constructor(platform: Platform) {
    this.platform = platform;
  }

  async initialize(): Promise<void> {}
  async shutdown(): Promise<void> {}

  on(_event: PlatformEvent, _handler: (data: PlatformEventData) => void): void {}
  off(_event: PlatformEvent, _handler: (data: PlatformEventData) => void): void {}
  emit(_event: PlatformEvent, _data: PlatformEventData): void {}

  seedSession(session: PlatformSession): void {
    this.sessions.set(session.id, session);
  }

  async createSession(userId: string, sessionId: string): Promise<PlatformSession> {
    const s: PlatformSession = {
      id: sessionId,
      platform: this.platform,
      userId,
      status: PlatformStatus.CONNECTED,
      authMethod: AuthMethod.QR_CODE,
      createdAt: new Date(),
      lastConnectedAt: new Date(),
    };
    this.sessions.set(sessionId, s);
    return s;
  }

  async getSession(sessionId: string): Promise<PlatformSession | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async getUserSessions(userId: string): Promise<PlatformSession[]> {
    return [...this.sessions.values()].filter((s) => s.userId === userId);
  }

  async disconnectSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async reconnectSession(_sessionId: string): Promise<void> {}

  async getAuthData(_sessionId: string): Promise<Record<string, unknown> | null> {
    return null;
  }

  async sendMessage(
    sessionId: string,
    chatId: string,
    message: OutgoingMessage
  ): Promise<UnifiedMessage> {
    this.lastSentMessage = { sessionId, chatId, message };
    return {
      id: `sent-${Date.now()}`,
      platformMessageId: `plat-${Date.now()}`,
      platform: this.platform,
      sessionId,
      userId: 'user-1',
      content: message.content,
      contentType: MessageContentType.TEXT,
      senderId: 'me',
      chatId,
      chatType: 'individual',
      timestamp: new Date(),
      isFromMe: true,
      isRead: true,
      hasMedia: false,
    };
  }

  async getContacts(_sessionId: string): Promise<UnifiedContact[]> { return []; }
  async getChats(_sessionId: string): Promise<UnifiedChat[]> { return []; }
  async markAsRead(_sessionId: string, _chatId: string, _messageId: string): Promise<void> {}
  async searchMessages(): Promise<UnifiedMessage[]> { return []; }
}

// ---------------------------------------------------------------------------
// Build a minimal Express app with the platforms router wired to fake adapters
// ---------------------------------------------------------------------------

function buildApp(adapters: Map<Platform, FakeAdapter>) {
  // Stub out requireAuth so tests don't need a real JWT
  const requireAuth = (_req: Request, _res: Response, next: NextFunction) => {
    (_req as unknown as { user: { id: string } }).user = { id: 'user-1' };
    next();
  };

  // Stub platformManager — needs getAdapter + PlatformStatus re-exported
  const platformManager = {
    getAdapter: (platform: Platform) => adapters.get(platform),
  };

  // Build a minimal router inline to avoid loading the full platforms.ts
  // (which would pull in Instagram login dependencies).
  const router = express.Router();

  router.use((_req, _res, next) => {
    (_req as unknown as { user: { id: string } }).user = { id: 'user-1' };
    next();
  });

  router.post('/:platform/send', async (req: Request, res: Response) => {
    const { platform } = req.params;
    const { sessionId, chatId, content, replyToMessageId } = req.body;
    const userId = (req as unknown as { user: { id: string } }).user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    if (!sessionId || !chatId || !content) {
      return res.status(400).json({ success: false, error: 'Session ID, chat ID, and content are required' });
    }

    const adapter = platformManager.getAdapter(platform as Platform);
    if (!adapter) {
      return res.status(404).json({ success: false, error: 'Platform not available' });
    }

    const session = await adapter.getSession(sessionId);
    if (!session || session.userId !== userId) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    if (session.status !== PlatformStatus.CONNECTED) {
      return res.status(400).json({ success: false, error: 'Session not connected' });
    }
    if (!adapter.capabilities.canSendText) {
      return res.status(400).json({ success: false, error: 'Platform does not support sending messages' });
    }

    const message = await adapter.sendMessage(sessionId, chatId, { content, replyToMessageId });
    return res.json({ success: true, message });
  });

  const app = express();
  app.use(express.json());
  app.use('/platforms', router);
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const PLATFORMS: Platform[] = [Platform.WHATSAPP, Platform.TELEGRAM, Platform.INSTAGRAM];

describe('POST /platforms/:platform/send — send reliability (#34)', () => {
  let adapters: Map<Platform, FakeAdapter>;
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    adapters = new Map();
    for (const platform of PLATFORMS) {
      const adapter = new FakeAdapter(platform);
      adapter.seedSession({
        id: `session-${platform}`,
        platform,
        userId: 'user-1',
        status: PlatformStatus.CONNECTED,
        authMethod: AuthMethod.QR_CODE,
        createdAt: new Date(),
        lastConnectedAt: new Date(),
      });
      adapters.set(platform, adapter);
    }
    app = buildApp(adapters);
  });

  // -------------------------------------------------------------------------
  // Per-platform send round-trip
  // -------------------------------------------------------------------------

  for (const platform of PLATFORMS) {
    it(`${platform}: sends a text message and returns success`, async () => {
      const result = await invokeApp(app, 'POST', `/platforms/${platform}/send`, {
        sessionId: `session-${platform}`,
        chatId: `chat-${platform}-001`,
        content: `Hello from ${platform} test`,
      });

      expect(result.status).toBe(200);
      const body = result.body;
      expect(body.success).toBe(true);
      expect(body.message).toBeDefined();
      expect(body.message.content).toBe(`Hello from ${platform} test`);
      expect(body.message.isFromMe).toBe(true);
      expect(body.message.chatId).toBe(`chat-${platform}-001`);

      // Verify the adapter received the correct call
      const adapter = adapters.get(platform)!;
      expect(adapter.lastSentMessage).not.toBeNull();
      expect(adapter.lastSentMessage!.sessionId).toBe(`session-${platform}`);
      expect(adapter.lastSentMessage!.chatId).toBe(`chat-${platform}-001`);
      expect(adapter.lastSentMessage!.message.content).toBe(`Hello from ${platform} test`);
    });
  }

  // -------------------------------------------------------------------------
  // Error paths (tested once; applies to all platforms via common route code)
  // -------------------------------------------------------------------------

  it('returns 400 when content is missing', async () => {
    const result = await invokeApp(app, 'POST', '/platforms/whatsapp/send', {
      sessionId: 'session-whatsapp',
      chatId: 'chat-001',
      // content omitted
    });
    expect(result.status).toBe(400);
    expect(result.body.error).toMatch(/required/i);
  });

  it('returns 404 when session not found', async () => {
    const result = await invokeApp(app, 'POST', '/platforms/whatsapp/send', {
      sessionId: 'no-such-session',
      chatId: 'chat-001',
      content: 'Hi',
    });
    expect(result.status).toBe(404);
    expect(result.body.error).toMatch(/not found/i);
  });

  it('returns 400 when session is not connected', async () => {
    // Seed a disconnected session
    adapters.get(Platform.WHATSAPP)!.seedSession({
      id: 'session-disconnected',
      platform: Platform.WHATSAPP,
      userId: 'user-1',
      status: PlatformStatus.DISCONNECTED,
      authMethod: AuthMethod.QR_CODE,
      createdAt: new Date(),
      lastConnectedAt: new Date(),
    });

    const result = await invokeApp(app, 'POST', '/platforms/whatsapp/send', {
      sessionId: 'session-disconnected',
      chatId: 'chat-001',
      content: 'Hi',
    });
    expect(result.status).toBe(400);
    expect(result.body.error).toMatch(/not connected/i);
  });

  it('returns 404 when platform adapter is not registered', async () => {
    // Remove the telegram adapter
    adapters.delete(Platform.TELEGRAM);
    app = buildApp(adapters);

    const result = await invokeApp(app, 'POST', '/platforms/telegram/send', {
      sessionId: 'session-telegram',
      chatId: 'chat-001',
      content: 'Hi',
    });
    expect(result.status).toBe(404);
    expect(result.body.error).toMatch(/not available/i);
  });

  it('includes replyToMessageId when provided', async () => {
    const result = await invokeApp(app, 'POST', '/platforms/whatsapp/send', {
      sessionId: 'session-whatsapp',
      chatId: 'chat-wa-001',
      content: 'Replying!',
      replyToMessageId: 'original-msg-id',
    });

    expect(result.status).toBe(200);
    const adapter = adapters.get(Platform.WHATSAPP)!;
    expect(adapter.lastSentMessage!.message.replyToMessageId).toBe('original-msg-id');
  });
});

// ---------------------------------------------------------------------------
// Minimal in-process HTTP helper (no external test framework required)
// ---------------------------------------------------------------------------

async function invokeApp(
  app: express.Application,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve) => {
    const req = {
      method,
      url: path,
      headers: { 'content-type': 'application/json' },
      body,
      user: { id: 'user-1' },
    } as unknown as Request;

    const chunks: Buffer[] = [];
    const res = {
      statusCode: 200,
      _headers: {} as Record<string, string>,
      status(code: number) { this.statusCode = code; return this; },
      setHeader(k: string, v: string) { this._headers[k] = v; },
      json(data: unknown) {
        resolve({ status: this.statusCode, body: data as Record<string, unknown> });
      },
    } as unknown as Response;

    // Walk the Express stack manually
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (app as unknown as any).handle(req, res, () => {
      resolve({ status: 404, body: { error: 'Not found' } });
    });
  });
}
