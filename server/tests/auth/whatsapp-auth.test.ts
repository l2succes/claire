import { WhatsAppAuthService } from '../../src/auth/whatsapp-auth';
import { redis } from '../../src/services/redis';

// Mock dependencies
jest.mock('../../src/services/redis');
jest.mock('../../src/utils/logger');

describe('WhatsAppAuthService', () => {
  let authService: WhatsAppAuthService;

  beforeEach(() => {
    jest.clearAllMocks();
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
      await expect(
        authService.disconnectSession('non-existent')
      ).resolves.not.toThrow();
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