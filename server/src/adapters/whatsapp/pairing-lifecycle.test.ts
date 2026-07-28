/**
 * Regression tests for WhatsApp pairing session lifecycle (#95).
 *
 * Guards the core bug: repeated `POST /platforms/whatsapp/connect` (i.e. repeated
 * `adapter.createSession` for one user) must NOT spawn concurrent Chromium/WhatsApp
 * clients. A pending session that already holds a pairing code is reused; other
 * stale pending sessions are destroyed before a replacement starts; and a WhatsApp
 * pairing-code rejection is swallowed instead of crashing the process.
 *
 * whatsapp-web.js (puppeteer) and redis are mocked so no browser or infra is needed.
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import {
  AuthMethod,
  Platform,
  PlatformSession,
  PlatformStatus,
} from '../types';

// Controls what the mocked whatsapp-web.js Client.requestPairingCode does.
let pairingCodeImpl: (...args: unknown[]) => Promise<string> = async () => 'CODE1234';

// Every constructed mock client is recorded so tests can assert how many were made.
const clientInstances: MockClient[] = [];

class MockClient {
  opts: unknown;
  destroyed = false;
  initialized = false;
  pupPage: unknown = null;
  handlers: Record<string, (...a: unknown[]) => void> = {};
  info: unknown = null;

  constructor(opts: unknown) {
    this.opts = opts;
    clientInstances.push(this);
  }
  on(event: string, cb: (...a: unknown[]) => void) {
    this.handlers[event] = cb;
  }
  async initialize() {
    this.initialized = true;
  }
  async destroy() {
    this.destroyed = true;
  }
  requestPairingCode(...args: unknown[]): Promise<string> {
    return pairingCodeImpl(...args);
  }
}

mock.module('whatsapp-web.js', () => ({
  Client: MockClient,
  LocalAuth: class {
    constructor(_opts: unknown) {}
  },
  Message: class {},
  GroupChat: class {},
}));

mock.module('../../services/redis', () => ({
  redis: {
    keys: async () => [] as string[],
    get: async () => null,
    set: async () => 'OK',
    setex: async () => 'OK',
    del: async () => 1,
    expire: async () => 1,
  },
}));

mock.module('../../utils/logger', () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
  stream: { write: () => {} },
}));

mock.module('qrcode', () => ({ toDataURL: async () => 'data:image/png;base64,stub' }));

// Import after mocks are registered. A dynamic import (rather than a hoisted
// static import) guarantees ./index resolves whatsapp-web.js to the mock above.
const { WhatsAppAdapter } = await import('./index');

const USER = 'user-1';
const PHONE = { phoneNumber: '+15551234567' };

function pendingSession(
  id: string,
  status: PlatformStatus,
  pairingCode?: string
): PlatformSession {
  return {
    id,
    userId: USER,
    platform: Platform.WHATSAPP,
    status,
    authMethod: AuthMethod.PAIRING_CODE,
    authData: pairingCode ? { pairingCode } : undefined,
    createdAt: new Date(),
    capabilities: {
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
      supportedMediaTypes: [],
    },
  };
}

describe('WhatsApp pairing session lifecycle (#95)', () => {
  beforeEach(() => {
    clientInstances.length = 0;
    pairingCodeImpl = async () => 'CODE1234';
  });

  it('reuses a pending session that already has a pairing code instead of creating a new client', async () => {
    const adapter = new WhatsAppAdapter();

    await adapter.createSession(USER, 'sess-1', PHONE);
    expect(clientInstances.length).toBe(1);

    // Simulate WhatsApp having issued a pairing code for the first session.
    const first = (adapter as any).sessions.get('sess-1') as PlatformSession;
    first.status = PlatformStatus.AWAITING_AUTH;
    first.authData = { pairingCode: 'ABCD1234' };

    // A second Connect for the same user must reuse sess-1, not spawn a client.
    const result = await adapter.createSession(USER, 'sess-2', PHONE);

    expect(result.id).toBe('sess-1');
    expect(result.authData?.pairingCode).toBe('ABCD1234');
    expect(clientInstances.length).toBe(1);
    expect((adapter as any).clients.has('sess-2')).toBe(false);
  });

  it('destroys stale pending sessions before returning the reusable one', async () => {
    const adapter = new WhatsAppAdapter();

    // Two live pending sessions for the same user: one with a code, one without.
    const keep = pendingSession('keep', PlatformStatus.AWAITING_AUTH, 'KEEP1234');
    const drop = pendingSession('drop', PlatformStatus.INITIALIZING);
    (adapter as any).sessions.set('keep', keep);
    (adapter as any).sessions.set('drop', drop);
    const keepClient = new MockClient({});
    const dropClient = new MockClient({});
    (adapter as any).clients.set('keep', keepClient);
    (adapter as any).clients.set('drop', dropClient);
    clientInstances.length = 0; // ignore the two injected above

    const result = await adapter.createSession(USER, 'new-sess', PHONE);

    expect(result.id).toBe('keep');
    // Stale one destroyed and removed; reusable one untouched; no replacement client.
    expect(dropClient.destroyed).toBe(true);
    expect(keepClient.destroyed).toBe(false);
    expect((adapter as any).sessions.has('drop')).toBe(false);
    expect((adapter as any).clients.has('drop')).toBe(false);
    expect(clientInstances.length).toBe(0);
  });

  it('swallows a WhatsApp pairing-code rejection instead of throwing', async () => {
    pairingCodeImpl = async () => {
      throw new Error('t'); // the opaque rejection WhatsApp returns on rapid re-pairing
    };
    const adapter = new WhatsAppAdapter();

    await adapter.createSession(USER, 'sess-reject', PHONE);
    const client = adapter.getClient('sess-reject');
    expect(client).toBeDefined();

    // The adapter wraps requestPairingCode so the rejection resolves to '' (no throw).
    await expect(client!.requestPairingCode()).resolves.toBe('');
  });
});
