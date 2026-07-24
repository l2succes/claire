import { describe, it, expect, beforeEach, mock } from 'bun:test';

// ──────────────────────────────────────────────────────────────────────────────
// Bun-style module mocks. (Ported from Jest auto-mocks; bun:test does not
// preload tests/setup.ts, so heavy deps like whatsapp-web.js are mocked here.)
// ──────────────────────────────────────────────────────────────────────────────
const redisMock = {
  get: mock(async (..._args: unknown[]) => null as string | null),
  set: mock(async (..._args: unknown[]) => 'OK'),
  setex: mock(async (..._args: unknown[]) => 'OK'),
  del: mock(async (..._args: unknown[]) => 1),
  keys: mock(async (..._args: unknown[]) => [] as string[]),
  exists: mock(async (..._args: unknown[]) => 0),
  expire: mock(async (..._args: unknown[]) => 1),
  quit: mock(async () => 'OK'),
};
mock.module('../../src/services/redis', () => ({ redis: redisMock }));

mock.module('../../src/utils/logger', () => ({
  logger: { info: mock(() => {}), warn: mock(() => {}), error: mock(() => {}), debug: mock(() => {}) },
  stream: { write: mock(() => {}) },
}));

// whatsapp-web.js launches puppeteer on Client.initialize() — stub it out.
mock.module('whatsapp-web.js', () => ({
  Client: mock(function MockClient() {
    return {
      on: mock(() => {}),
      initialize: mock(async () => {}),
      destroy: mock(async () => {}),
      getState: mock(async () => 'CONNECTED'),
      sendMessage: mock(async () => ({ id: { _serialized: 'mock-msg-id' } })),
      info: undefined,
    };
  }),
  LocalAuth: mock(function MockLocalAuth() { return {}; }),
}));

import { WhatsAppAuthService } from '../../src/auth/whatsapp-auth';
import { redis } from '../../src/services/redis';

type AnyMock = ReturnType<typeof mock>;

describe('WhatsAppAuthService', () => {
  let authService: WhatsAppAuthService;

  beforeEach(() => {
    // Clear call history and restore default implementations between tests.
    for (const m of Object.values(redisMock)) (m as AnyMock).mockClear();
    redisMock.get.mockResolvedValue(null);
    redisMock.keys.mockResolvedValue([]);
    authService = new WhatsAppAuthService();
  });

  describe('createSession', () => {
    it('should create a new WhatsApp session', async () => {
      const userId = 'test-user-123';
      const sessionId = 'test-session-123';

      const session = await authService.createSession(userId, sessionId);

      expect(session).toBeDefined();
      expect(session.id).toBe(sessionId);
      expect(session.userId).toBe(userId);
      expect(session.status).toBe('initializing');
      expect(session.createdAt).toBeInstanceOf(Date);
    });

    it('should throw error if session already exists', async () => {
      const userId = 'test-user-123';
      const sessionId = 'test-session-123';

      // Create first session
      await authService.createSession(userId, sessionId);

      // Try to create duplicate
      await expect(
        authService.createSession(userId, sessionId)
      ).rejects.toThrow('Session already exists');
    });
  });

  describe('getSession', () => {
    it('should retrieve session from memory', async () => {
      const userId = 'test-user-123';
      const sessionId = 'test-session-123';

      await authService.createSession(userId, sessionId);
      const session = await authService.getSession(sessionId);

      expect(session).toBeDefined();
      expect(session?.id).toBe(sessionId);
    });

    it('should retrieve session from Redis if not in memory', async () => {
      const sessionId = 'redis-session-123';
      const mockSession = {
        id: sessionId,
        userId: 'user-123',
        status: 'ready',
        phoneNumber: '1234567890',
        createdAt: new Date(),
        lastConnected: new Date(),
      };

      (redis.get as jest.Mock).mockResolvedValue(JSON.stringify(mockSession));

      const session = await authService.getSession(sessionId);

      expect(session).toBeDefined();
      expect(session?.id).toBe(sessionId);
      expect(redis.get).toHaveBeenCalledWith(`whatsapp:session:${sessionId}`);
    });

    it('should return null for non-existent session', async () => {
      (redis.get as jest.Mock).mockResolvedValue(null);

      const session = await authService.getSession('non-existent');

      expect(session).toBeNull();
    });
  });

  describe('getUserSessions', () => {
    it('should return all sessions for a user', async () => {
      const userId = 'test-user-123';
      const sessionId1 = 'session-1';
      const sessionId2 = 'session-2';

      await authService.createSession(userId, sessionId1);
      await authService.createSession(userId, sessionId2);

      const sessions = await authService.getUserSessions(userId);

      expect(sessions).toHaveLength(2);
      expect(sessions.map(s => s.id)).toContain(sessionId1);
      expect(sessions.map(s => s.id)).toContain(sessionId2);
    });

    it('should return empty array for user with no sessions', async () => {
      (redis.keys as jest.Mock).mockResolvedValue([]);

      const sessions = await authService.getUserSessions('no-sessions-user');

      expect(sessions).toHaveLength(0);
    });
  });

  describe('disconnectSession', () => {
    it('should disconnect an active session', async () => {
      const userId = 'test-user-123';
      const sessionId = 'test-session-123';

      await authService.createSession(userId, sessionId);
      await authService.disconnectSession(sessionId);

      const session = await authService.getSession(sessionId);
      expect(session?.status).toBe('disconnected');
    });

    it('should handle disconnecting non-existent session gracefully', async () => {
      // Should resolve (not reject) — disconnecting an unknown session is a no-op.
      await expect(
        authService.disconnectSession('non-existent')
      ).resolves.toBeUndefined();
    });
  });

  describe('isSessionConnected', () => {
    it('should return false for non-existent session', () => {
      const isConnected = authService.isSessionConnected('non-existent');
      expect(isConnected).toBe(false);
    });

    it('should return false for disconnected session', async () => {
      const userId = 'test-user-123';
      const sessionId = 'test-session-123';

      await authService.createSession(userId, sessionId);
      await authService.disconnectSession(sessionId);

      const isConnected = authService.isSessionConnected(sessionId);
      expect(isConnected).toBe(false);
    });
  });

  describe('QR Code handling', () => {
    it('should return null when no QR code is available', async () => {
      const userId = 'test-user-123';
      const sessionId = 'test-session-123';

      await authService.createSession(userId, sessionId);
      const qrCode = await authService.getQRCode(sessionId);

      expect(qrCode).toBeNull();
    });
  });
});