/**
 * Demo adapter behaviour.
 *
 * The property under test is containment: a demo account gets synthetic
 * sessions and locally-handled sends, and every other call reaches the real
 * adapter untouched. A regression here would either break a demo or, much
 * worse, let demo behaviour leak onto a real account.
 */

import { beforeEach, describe, expect, it } from 'bun:test';

import { DemoBridgeAdapter } from './index';
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
  PlatformStatus,
  UnifiedChat,
  UnifiedContact,
  UnifiedMessage,
} from '../types';
import { demoSessionId } from '../../demo/fixtures';

const DEMO_USER = 'aaaaaaaa-0000-4000-8000-000000000001';
const REAL_USER = 'bbbbbbbb-0000-4000-8000-000000000002';

const CAPABILITIES: PlatformCapabilities = {
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

/** Records what reached the real adapter. */
class StubDelegate implements IPlatformAdapter {
  readonly platform = Platform.WHATSAPP;
  readonly authMethod = AuthMethod.QR_CODE;
  readonly capabilities = CAPABILITIES;

  calls: string[] = [];

  async initialize(): Promise<void> {
    this.calls.push('initialize');
  }
  async shutdown(): Promise<void> {
    this.calls.push('shutdown');
  }
  async createSession(userId: string, sessionId: string): Promise<PlatformSession> {
    this.calls.push(`createSession:${userId}`);
    return {
      id: sessionId,
      platform: Platform.WHATSAPP,
      userId,
      status: PlatformStatus.AWAITING_AUTH,
      authMethod: AuthMethod.QR_CODE,
      createdAt: new Date(),
      capabilities: CAPABILITIES,
    };
  }
  async getSession(sessionId: string): Promise<PlatformSession | null> {
    this.calls.push(`getSession:${sessionId}`);
    return null;
  }
  async getUserSessions(userId: string): Promise<PlatformSession[]> {
    this.calls.push(`getUserSessions:${userId}`);
    return [];
  }
  async disconnectSession(sessionId: string): Promise<void> {
    this.calls.push(`disconnectSession:${sessionId}`);
  }
  async reconnectSession(sessionId: string): Promise<void> {
    this.calls.push(`reconnectSession:${sessionId}`);
  }
  async getAuthData(sessionId: string): Promise<unknown> {
    this.calls.push(`getAuthData:${sessionId}`);
    return { real: true };
  }
  async sendMessage(sessionId: string, chatId: string, message: OutgoingMessage): Promise<UnifiedMessage> {
    this.calls.push(`sendMessage:${sessionId}`);
    return {
      id: 'real-1',
      platformMessageId: 'real-1',
      platform: Platform.WHATSAPP,
      sessionId,
      userId: REAL_USER,
      content: message.content,
      contentType: MessageContentType.TEXT,
      senderId: 'real-self',
      chatId,
      chatType: 'individual',
      timestamp: new Date(),
      isFromMe: true,
      isRead: true,
      hasMedia: false,
    };
  }
  async markAsRead(sessionId: string): Promise<void> {
    this.calls.push(`markAsRead:${sessionId}`);
  }
  async getContacts(sessionId: string): Promise<UnifiedContact[]> {
    this.calls.push(`getContacts:${sessionId}`);
    return [];
  }
  async getChats(sessionId: string): Promise<UnifiedChat[]> {
    this.calls.push(`getChats:${sessionId}`);
    return [];
  }
  async getChatHistory(sessionId: string): Promise<UnifiedMessage[]> {
    this.calls.push(`getChatHistory:${sessionId}`);
    return [];
  }
  on(event: PlatformEvent, _handler: PlatformEventHandler): void {
    this.calls.push(`on:${event}`);
  }
  off(event: PlatformEvent, _handler: PlatformEventHandler): void {
    this.calls.push(`off:${event}`);
  }
}

interface Harness {
  adapter: DemoBridgeAdapter;
  delegate: StubDelegate;
  ingested: UnifiedMessage[];
  outgoing: Array<{ userId: string; platform: Platform; chatId: string; content: string }>;
}

function harness(): Harness {
  const delegate = new StubDelegate();
  const ingested: UnifiedMessage[] = [];
  const outgoing: Harness['outgoing'] = [];
  const adapter = new DemoBridgeAdapter(delegate, {
    ingest: async (message) => {
      ingested.push(message);
    },
    isDemoUser: async (userId) => userId === DEMO_USER,
    onOutgoing: (event) => {
      outgoing.push(event);
    },
  });
  return { adapter, delegate, ingested, outgoing };
}

let h: Harness;
beforeEach(() => {
  h = harness();
});

describe('pass-through for real accounts', () => {
  it('delegates session lookups for a real session identifier', async () => {
    await h.adapter.getSession('matrix-session-xyz');
    expect(h.delegate.calls).toContain('getSession:matrix-session-xyz');
  });

  it('delegates user session lookups for a non-demo account', async () => {
    await h.adapter.getUserSessions(REAL_USER);
    expect(h.delegate.calls).toContain(`getUserSessions:${REAL_USER}`);
  });

  it('delegates sends on a real session and ingests nothing itself', async () => {
    await h.adapter.sendMessage('matrix-session-xyz', 'chat-1', { content: 'hello' });
    expect(h.delegate.calls).toContain('sendMessage:matrix-session-xyz');
    expect(h.ingested).toHaveLength(0);
    expect(h.outgoing).toHaveLength(0);
  });

  it('delegates disconnects, reads, contacts, chats and history', async () => {
    await h.adapter.disconnectSession('matrix-session-xyz');
    await h.adapter.markAsRead('matrix-session-xyz', 'chat-1', 'msg-1');
    await h.adapter.getContacts('matrix-session-xyz');
    await h.adapter.getChats('matrix-session-xyz');
    await h.adapter.getChatHistory('matrix-session-xyz', 'chat-1');
    expect(h.delegate.calls).toEqual([
      'disconnectSession:matrix-session-xyz',
      'markAsRead:matrix-session-xyz',
      'getContacts:matrix-session-xyz',
      'getChats:matrix-session-xyz',
      'getChatHistory:matrix-session-xyz',
    ]);
  });

  it('passes event subscription straight through, keeping one event path', () => {
    const handler: PlatformEventHandler = () => {};
    h.adapter.on('message', handler);
    h.adapter.off('message', handler);
    expect(h.delegate.calls).toEqual(['on:message', 'off:message']);
  });

  it('forwards lifecycle to the real adapter', async () => {
    await h.adapter.initialize();
    await h.adapter.shutdown();
    expect(h.delegate.calls).toEqual(['initialize', 'shutdown']);
  });
});

describe('demo accounts', () => {
  it('reports a connected session per demo platform', async () => {
    const sessions = await h.adapter.getUserSessions(DEMO_USER);
    expect(sessions).toHaveLength(3);
    expect(sessions.every((session) => session.status === PlatformStatus.CONNECTED)).toBe(true);
    expect(h.delegate.calls).toHaveLength(0);
  });

  it('resolves its own session identifiers without touching the real adapter', async () => {
    const sessionId = demoSessionId(Platform.TELEGRAM, DEMO_USER);
    const session = await h.adapter.getSession(sessionId);
    expect(session?.id).toBe(sessionId);
    expect(session?.userId).toBe(DEMO_USER);
    expect(h.delegate.calls).toHaveLength(0);
  });

  it('ingests an outgoing message and then asks for a reply', async () => {
    const sessionId = demoSessionId(Platform.WHATSAPP, DEMO_USER);
    const sent = await h.adapter.sendMessage(sessionId, '15550138871', { content: 'dinner friday?' });

    expect(sent.isFromMe).toBe(true);
    expect(sent.userId).toBe(DEMO_USER);
    expect(h.ingested).toHaveLength(1);
    expect(h.ingested[0].content).toBe('dinner friday?');
    expect(h.ingested[0].isFromMe).toBe(true);
    expect(h.outgoing).toEqual([
      { userId: DEMO_USER, platform: Platform.WHATSAPP, chatId: '15550138871', content: 'dinner friday?' },
    ]);
    expect(h.delegate.calls).toHaveLength(0);
  });

  it('persists the outgoing message before requesting a reply', async () => {
    // The persona reads the message it is replying to out of the database, so
    // ordering here is load-bearing rather than incidental.
    const order: string[] = [];
    const adapter = new DemoBridgeAdapter(new StubDelegate(), {
      ingest: async () => {
        order.push('ingest');
      },
      isDemoUser: async () => true,
      onOutgoing: () => {
        order.push('onOutgoing');
      },
    });
    await adapter.sendMessage(demoSessionId(Platform.WHATSAPP, DEMO_USER), '15550138871', {
      content: 'hi',
    });
    expect(order).toEqual(['ingest', 'onOutgoing']);
  });

  it('marks a group chat identifier as a group send', async () => {
    const sessionId = demoSessionId(Platform.WHATSAPP, DEMO_USER);
    const sent = await h.adapter.sendMessage(sessionId, 'demo-group-redhook@g.us', { content: 'in' });
    expect(sent.chatType).toBe('group');
  });

  it('answers chats, contacts and history from the fixture pack', async () => {
    const sessionId = demoSessionId(Platform.INSTAGRAM, DEMO_USER);
    const chats = await h.adapter.getChats(sessionId);
    const contacts = await h.adapter.getContacts(sessionId);
    const history = await h.adapter.getChatHistory(sessionId, '17841409922104');

    expect(chats.length).toBeGreaterThan(0);
    expect(chats.every((chat) => chat.platform === Platform.INSTAGRAM)).toBe(true);
    expect(contacts.every((contact) => contact.platform === Platform.INSTAGRAM)).toBe(true);
    expect(history.length).toBeGreaterThan(0);
    expect(h.delegate.calls).toHaveLength(0);
  });

  it('ignores disconnect and read receipts for a synthetic session', async () => {
    const sessionId = demoSessionId(Platform.WHATSAPP, DEMO_USER);
    await h.adapter.disconnectSession(sessionId);
    await h.adapter.markAsRead(sessionId, 'chat', 'msg');
    expect(h.delegate.calls).toHaveLength(0);
  });

  it('returns its existing session rather than starting a real bridge login', async () => {
    const session = await h.adapter.createSession(DEMO_USER, 'ignored-id');
    expect(session.status).toBe(PlatformStatus.CONNECTED);
    expect(h.delegate.calls).toHaveLength(0);
  });
});

describe('the gate', () => {
  it('does not mint a session for a well-formed identifier owned by a real account', async () => {
    const forged = demoSessionId(Platform.WHATSAPP, REAL_USER);
    expect(await h.adapter.getSession(forged)).toBeNull();
    expect(h.delegate.calls).toHaveLength(0);
  });

  it('refuses to send on a demo identifier belonging to a real account', async () => {
    const forged = demoSessionId(Platform.WHATSAPP, REAL_USER);
    await expect(
      h.adapter.sendMessage(forged, '15550138871', { content: 'hello' })
    ).rejects.toThrow('Session not found');
    expect(h.ingested).toHaveLength(0);
    expect(h.outgoing).toHaveLength(0);
  });

  it('does not give a real account synthetic sessions', async () => {
    expect(await h.adapter.getUserSessions(REAL_USER)).toEqual([]);
  });
});
