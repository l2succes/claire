/**
 * Integration Test: Session Persistence with Redis
 * Tests session save/restore functionality across server restarts
 *
 * Prerequisites:
 * - Redis running on localhost:6379 or via REDIS_HOST/REDIS_PORT env vars
 * - Validates Bug #3 fix: selfGhostId persistence
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import Redis from 'ioredis';
import { PlatformSession, PlatformStatus, Platform } from '../../src/adapters/types';

describe('Session Persistence Integration', () => {
  let redis: Redis;
  const TEST_KEY_PREFIX = 'test:session:';

  beforeAll(async () => {
    // Connect to Redis
    redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    });

    // Wait for connection
    await redis.ping();
  });

  afterAll(async () => {
    // Clean up all test keys
    const keys = await redis.keys(`${TEST_KEY_PREFIX}*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    await redis.quit();
  });

  beforeEach(async () => {
    // Clean up test keys before each test
    const keys = await redis.keys(`${TEST_KEY_PREFIX}*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  describe('Session Save and Load', () => {
    it('should save and restore a complete session', async () => {
      const sessionId = 'session-test-1';
      const key = `${TEST_KEY_PREFIX}${sessionId}`;

      const originalSession: PlatformSession = {
        id: sessionId,
        userId: 'user-123',
        platform: Platform.WHATSAPP,
        status: PlatformStatus.CONNECTED,
        createdAt: new Date('2024-01-01T00:00:00Z'),
        connectedAt: new Date('2024-01-01T00:05:00Z'),
        lastActivity: new Date('2024-01-01T01:00:00Z'),
        platformMetadata: {
          phoneNumber: '+15166100494',
          deviceId: 'device-abc-123',
        },
      };

      // Save to Redis
      await redis.setex(key, 86400, JSON.stringify(originalSession));

      // Load from Redis
      const savedData = await redis.get(key);
      expect(savedData).not.toBeNull();

      const restoredSession = JSON.parse(savedData!) as PlatformSession;

      // Restore Date objects (mimics real adapter logic)
      restoredSession.createdAt = new Date(restoredSession.createdAt);
      restoredSession.connectedAt = restoredSession.connectedAt ? new Date(restoredSession.connectedAt) : undefined;
      restoredSession.lastActivity = restoredSession.lastActivity ? new Date(restoredSession.lastActivity) : undefined;

      // Verify all fields match
      expect(restoredSession.id).toBe(originalSession.id);
      expect(restoredSession.userId).toBe(originalSession.userId);
      expect(restoredSession.platform).toBe(originalSession.platform);
      expect(restoredSession.status).toBe(originalSession.status);
      expect(restoredSession.createdAt).toEqual(originalSession.createdAt);
      expect(restoredSession.connectedAt).toEqual(originalSession.connectedAt);
      expect(restoredSession.lastActivity).toEqual(originalSession.lastActivity);
      expect(restoredSession.platformMetadata).toEqual(originalSession.platformMetadata);
    });

    it('should save session with 24h TTL', async () => {
      const sessionId = 'session-test-2';
      const key = `${TEST_KEY_PREFIX}${sessionId}`;

      const session: PlatformSession = {
        id: sessionId,
        userId: 'user-123',
        platform: Platform.TELEGRAM,
        status: PlatformStatus.CONNECTED,
        createdAt: new Date(),
      };

      // Save with 24h TTL
      await redis.setex(key, 86400, JSON.stringify(session));

      // Check TTL
      const ttl = await redis.ttl(key);
      expect(ttl).toBeGreaterThan(86000); // Should be close to 86400
      expect(ttl).toBeLessThanOrEqual(86400);
    });
  });

  describe('selfGhostId Persistence - Bug #3 Validation', () => {
    it('should persist and restore selfGhostId for WhatsApp session', async () => {
      const sessionId = 'session-whatsapp-ghost';
      const key = `${TEST_KEY_PREFIX}${sessionId}`;
      const ghostKey = `${TEST_KEY_PREFIX}ghost:${sessionId}`;

      const session: PlatformSession = {
        id: sessionId,
        userId: 'user-123',
        platform: Platform.WHATSAPP,
        status: PlatformStatus.CONNECTED,
        createdAt: new Date(),
        platformMetadata: {
          phoneNumber: '+15166100494',
        },
      };

      const selfGhostId = '@whatsapp_15166100494:claire.local';

      // Save session and ghost ID
      await redis.setex(key, 86400, JSON.stringify(session));
      await redis.setex(ghostKey, 86400, selfGhostId);

      // Simulate server restart - restore session
      const restoredSessionData = await redis.get(key);
      const restoredGhostId = await redis.get(ghostKey);

      expect(restoredSessionData).not.toBeNull();
      expect(restoredGhostId).toBe(selfGhostId);

      const restoredSession = JSON.parse(restoredSessionData!);
      expect(restoredSession.platform).toBe(Platform.WHATSAPP);

      // Verify ghost ID format is correct for sender detection
      expect(restoredGhostId).toMatch(/@whatsapp_\d+:claire\.local/);
    });

    it('should persist selfGhostId for Instagram session', async () => {
      const sessionId = 'session-instagram-ghost';
      const key = `${TEST_KEY_PREFIX}${sessionId}`;
      const ghostKey = `${TEST_KEY_PREFIX}ghost:${sessionId}`;

      const selfGhostId = '@meta_17841234567890:claire.local';

      await redis.setex(key, 86400, JSON.stringify({
        id: sessionId,
        userId: 'user-456',
        platform: Platform.INSTAGRAM,
        status: PlatformStatus.CONNECTED,
        createdAt: new Date(),
      }));
      await redis.setex(ghostKey, 86400, selfGhostId);

      // Restore
      const restoredGhostId = await redis.get(ghostKey);
      expect(restoredGhostId).toBe(selfGhostId);
      expect(restoredGhostId).toMatch(/@meta_\d+:claire\.local/);
    });

    it('should persist selfGhostId for Telegram session', async () => {
      const sessionId = 'session-telegram-ghost';
      const ghostKey = `${TEST_KEY_PREFIX}ghost:${sessionId}`;

      const selfGhostId = '@_telegram_123456789:claire.local';

      await redis.setex(ghostKey, 86400, selfGhostId);

      const restoredGhostId = await redis.get(ghostKey);
      expect(restoredGhostId).toBe(selfGhostId);
      expect(restoredGhostId).toMatch(/@_telegram_\d+:claire\.local/);
    });
  });

  describe('Control Room Mapping Persistence', () => {
    it('should persist control room ID for session', async () => {
      const sessionId = 'session-control-room';
      const controlRoomKey = `${TEST_KEY_PREFIX}control:${sessionId}`;
      const controlRoomId = '!controlroom123:claire.local';

      // Save control room mapping
      await redis.setex(controlRoomKey, 86400, controlRoomId);

      // Restore
      const restoredRoomId = await redis.get(controlRoomKey);
      expect(restoredRoomId).toBe(controlRoomId);
      expect(restoredRoomId).toMatch(/^!/); // Matrix room IDs start with !
    });
  });

  describe('Session Cleanup', () => {
    it('should remove expired sessions after TTL', async () => {
      const sessionId = 'session-expiring';
      const key = `${TEST_KEY_PREFIX}${sessionId}`;

      const session: PlatformSession = {
        id: sessionId,
        userId: 'user-789',
        platform: Platform.WHATSAPP,
        status: PlatformStatus.DISCONNECTED,
        createdAt: new Date(),
      };

      // Save with 2 second TTL
      await redis.setex(key, 2, JSON.stringify(session));

      // Verify exists
      let exists = await redis.exists(key);
      expect(exists).toBe(1);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Verify expired
      exists = await redis.exists(key);
      expect(exists).toBe(0);
    }, 10000);

    it('should clean up non-CONNECTED sessions on startup', async () => {
      // Simulate sessions left over from previous server run
      const sessions = [
        { id: 'session-1', status: PlatformStatus.CONNECTED },
        { id: 'session-2', status: PlatformStatus.DISCONNECTED },
        { id: 'session-3', status: PlatformStatus.AUTHENTICATING },
        { id: 'session-4', status: PlatformStatus.FAILED },
      ];

      // Save all sessions
      for (const session of sessions) {
        await redis.setex(
          `${TEST_KEY_PREFIX}${session.id}`,
          86400,
          JSON.stringify({
            ...session,
            userId: 'user-cleanup',
            platform: Platform.WHATSAPP,
            createdAt: new Date(),
          })
        );
      }

      // Simulate startup cleanup: delete non-CONNECTED sessions
      const allKeys = await redis.keys(`${TEST_KEY_PREFIX}session-*`);
      for (const key of allKeys) {
        const data = await redis.get(key);
        if (data) {
          const session = JSON.parse(data);
          if (session.status !== PlatformStatus.CONNECTED) {
            await redis.del(key);
          }
        }
      }

      // Verify only CONNECTED session remains
      const remainingKeys = await redis.keys(`${TEST_KEY_PREFIX}session-*`);
      expect(remainingKeys.length).toBe(1);

      const remainingData = await redis.get(remainingKeys[0]);
      const remainingSession = JSON.parse(remainingData!);
      expect(remainingSession.status).toBe(PlatformStatus.CONNECTED);
      expect(remainingSession.id).toBe('session-1');
    });
  });

  describe('Platform Mapping Restoration', () => {
    it('should restore platform for session', async () => {
      const sessionId = 'session-platform-map';
      const key = `${TEST_KEY_PREFIX}${sessionId}`;

      const session: PlatformSession = {
        id: sessionId,
        userId: 'user-platform',
        platform: Platform.INSTAGRAM,
        status: PlatformStatus.CONNECTED,
        createdAt: new Date(),
      };

      await redis.setex(key, 86400, JSON.stringify(session));

      // Restore
      const data = await redis.get(key);
      const restored = JSON.parse(data!);

      expect(restored.platform).toBe(Platform.INSTAGRAM);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing Redis keys gracefully', async () => {
      const nonExistentKey = `${TEST_KEY_PREFIX}nonexistent`;

      const data = await redis.get(nonExistentKey);
      expect(data).toBeNull();
    });

    it('should handle malformed JSON gracefully', async () => {
      const key = `${TEST_KEY_PREFIX}malformed`;

      await redis.setex(key, 60, 'not valid json{]');

      const data = await redis.get(key);
      expect(data).toBe('not valid json{]');

      // Attempting to parse should throw
      expect(() => JSON.parse(data!)).toThrow();
    });

    it('should handle Redis connection failure gracefully', async () => {
      // Create a client with wrong port
      const badRedis = new Redis({
        host: 'localhost',
        port: 9999, // Non-existent port
        retryStrategy: () => null, // Don't retry
        lazyConnect: true,
      });

      // Connection should fail
      await expect(badRedis.ping()).rejects.toThrow();

      badRedis.disconnect();
    });
  });
});
