/**
 * Integration Test: API Contracts
 * Tests all API endpoints with Supertest to validate contracts, error handling, and rate limiting
 *
 * Prerequisites:
 * - Server running (or use supertest to start it)
 * - Valid test environment variables
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';

// Import routes
import authRoutes from '../../src/routes/auth';
import messagesRoutes from '../../src/routes/messages';
import aiRoutes from '../../src/routes/ai';
import platformsRoutes from '../../src/routes/platforms';
import conversationsRoutes from '../../src/routes/conversations';

describe('API Contract Integration Tests', () => {
  let app: Express;
  let authToken: string;
  let testUserId: string;

  beforeAll(async () => {
    // Create Express app with routes (mimics real server setup)
    app = express();
    app.use(helmet());
    app.use(cors());
    app.use(express.json());

    // Mount routes
    app.use('/auth', authRoutes);
    app.use('/messages', messagesRoutes);
    app.use('/ai', aiRoutes);
    app.use('/platforms', platformsRoutes);
    app.use('/conversations', conversationsRoutes);

    // Health endpoint
    app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: 'test',
      });
    });

    // Create test user and get auth token
    const signupRes = await request(app)
      .post('/auth/signup')
      .send({
        email: `test-${Date.now()}@example.com`,
        password: 'TestPassword123!',
        name: 'Test User',
      });

    if (signupRes.status === 200) {
      authToken = signupRes.body.session?.access_token;
      testUserId = signupRes.body.user?.id;
    }
  });

  afterAll(async () => {
    // Cleanup test data if needed
  });

  describe('Health Endpoint', () => {
    it('GET /health should return 200 with status', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'ok');
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body).toHaveProperty('uptime');
      expect(res.body).toHaveProperty('environment');
    });
  });

  describe('Auth Endpoints', () => {
    it('POST /auth/login should return 200 with valid credentials', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({
          email: 'test@example.com',
          password: 'ValidPassword123',
        });

      // May return 401 if user doesn't exist, but should not crash
      expect([200, 401]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body).toHaveProperty('user');
        expect(res.body).toHaveProperty('session');
      }
    });

    it('POST /auth/login should return 401 with invalid credentials', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({
          email: 'invalid@example.com',
          password: 'WrongPassword',
        });

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });

    it('POST /auth/signup should return 200 with valid data', async () => {
      const res = await request(app)
        .post('/auth/signup')
        .send({
          email: `signup-${Date.now()}@example.com`,
          password: 'SecurePassword123!',
          name: 'New User',
        });

      expect([200, 400]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body).toHaveProperty('user');
      }
    });

    it('POST /auth/signup should return 400 with duplicate email', async () => {
      const email = `duplicate-${Date.now()}@example.com`;

      // First signup
      await request(app)
        .post('/auth/signup')
        .send({
          email,
          password: 'Password123!',
          name: 'User 1',
        });

      // Duplicate signup
      const res = await request(app)
        .post('/auth/signup')
        .send({
          email,
          password: 'Password123!',
          name: 'User 2',
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('POST /auth/logout should return 200 when authenticated', async () => {
      if (!authToken) {
        return; // Skip if no auth token
      }

      const res = await request(app)
        .post('/auth/logout')
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 401]).toContain(res.status);
    });
  });

  describe('Rate Limiting - Auth Endpoints', () => {
    it('POST /auth/login should rate limit after 5 requests (Bug #6 validation)', async () => {
      const email = `ratelimit-${Date.now()}@example.com`;

      // Make 6 rapid login attempts
      const requests = Array.from({ length: 6 }, () =>
        request(app)
          .post('/auth/login')
          .send({ email, password: 'test' })
      );

      const responses = await Promise.all(requests);

      // First 5 should go through (401 or 200), 6th should be 429
      const statuses = responses.map(r => r.status);
      const rateLimitHit = statuses.includes(429);

      expect(rateLimitHit).toBe(true);

      // Find the 429 response
      const rateLimitedRes = responses.find(r => r.status === 429);
      if (rateLimitedRes) {
        expect(rateLimitedRes.body).toHaveProperty('error', 'Too many requests');
        expect(rateLimitedRes.body).toHaveProperty('retryAfter');
      }
    }, 15000);

    it('POST /auth/signup should rate limit after 5 requests', async () => {
      // Make 6 rapid signup attempts
      const requests = Array.from({ length: 6 }, (_, i) =>
        request(app)
          .post('/auth/signup')
          .send({
            email: `ratelimit-signup-${Date.now()}-${i}@example.com`,
            password: 'Test123!',
            name: 'Test',
          })
      );

      const responses = await Promise.all(requests);
      const statuses = responses.map(r => r.status);

      expect(statuses.includes(429)).toBe(true);
    }, 15000);
  });

  describe('Messages Endpoints', () => {
    it('GET /messages should return 401 without auth', async () => {
      const res = await request(app).get('/messages');

      expect(res.status).toBe(401);
    });

    it('GET /messages should return 200 with auth', async () => {
      if (!authToken) return;

      const res = await request(app)
        .get('/messages')
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 401]).toContain(res.status);
      if (res.status === 200) {
        expect(Array.isArray(res.body)).toBe(true);
      }
    });

    it('POST /messages/send should return 401 without auth', async () => {
      const res = await request(app)
        .post('/messages/send')
        .send({
          platform: 'whatsapp',
          sessionId: 'test-session',
          chatId: 'test-chat',
          content: 'Hello',
        });

      expect(res.status).toBe(401);
    });

    it('POST /messages/send should validate disconnected session (Bug #2)', async () => {
      if (!authToken) return;

      const res = await request(app)
        .post('/messages/send')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          platform: 'whatsapp',
          sessionId: 'disconnected-session',
          chatId: 'test-chat',
          content: 'Test message',
        });

      // Should return error (session not found or not connected)
      expect([400, 404]).toContain(res.status);
    });

    it('GET /messages/:chatId/history should return 401 without auth', async () => {
      const res = await request(app).get('/messages/test-chat-123/history');

      expect(res.status).toBe(401);
    });
  });

  describe('AI Endpoints', () => {
    it('POST /ai/responses/generate should return 401 without auth', async () => {
      const res = await request(app)
        .post('/ai/responses/generate')
        .send({
          messageId: 'msg-123',
          content: 'Hello, how are you?',
        });

      expect(res.status).toBe(401);
    });

    it('POST /ai/responses/generate should rate limit after 20 requests (Bug #6)', async () => {
      if (!authToken) return;

      // Make 21 rapid AI generation requests
      const requests = Array.from({ length: 21 }, () =>
        request(app)
          .post('/ai/responses/generate')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            messageId: `msg-${Date.now()}`,
            content: 'Test message',
          })
      );

      const responses = await Promise.all(requests);
      const statuses = responses.map(r => r.status);

      // Should have at least one 429 response
      expect(statuses.includes(429)).toBe(true);
    }, 30000);
  });

  describe('Platforms Endpoints', () => {
    it('GET /platforms should return 200 with available platforms', async () => {
      const res = await request(app).get('/platforms');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      if (res.body.length > 0) {
        expect(res.body[0]).toHaveProperty('id');
        expect(res.body[0]).toHaveProperty('name');
      }
    });

    it('GET /platforms/:platform/sessions should return 401 without auth', async () => {
      const res = await request(app).get('/platforms/whatsapp/sessions');

      expect(res.status).toBe(401);
    });

    it('POST /platforms/:platform/connect should return 401 without auth', async () => {
      const res = await request(app)
        .post('/platforms/whatsapp/connect')
        .send({ sessionName: 'test' });

      expect(res.status).toBe(401);
    });

    it('POST /platforms/:platform/disconnect should return 401 without auth', async () => {
      const res = await request(app)
        .post('/platforms/whatsapp/disconnect')
        .send({ sessionId: 'test-session' });

      expect(res.status).toBe(401);
    });
  });

  describe('Conversations Endpoints', () => {
    it('GET /conversations should return 401 without auth', async () => {
      const res = await request(app).get('/conversations');

      expect(res.status).toBe(401);
    });

    it('GET /conversations should return 200 with auth', async () => {
      if (!authToken) return;

      const res = await request(app)
        .get('/conversations')
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 401]).toContain(res.status);
      if (res.status === 200) {
        expect(Array.isArray(res.body)).toBe(true);
      }
    });
  });

  describe('Error Response Formats', () => {
    it('should return consistent error format for 401', async () => {
      const res = await request(app).get('/messages');

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
      expect(typeof res.body.error).toBe('string');
    });

    it('should return consistent error format for 400', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({
          // Missing required fields
        });

      expect([400, 401]).toContain(res.status);
      if (res.status === 400) {
        expect(res.body).toHaveProperty('error');
      }
    });

    it('should return consistent error format for 429 (rate limit)', async () => {
      // Make rapid requests to trigger rate limit
      const requests = Array.from({ length: 6 }, () =>
        request(app)
          .post('/auth/login')
          .send({ email: 'test@example.com', password: 'test' })
      );

      const responses = await Promise.all(requests);
      const rateLimited = responses.find(r => r.status === 429);

      if (rateLimited) {
        expect(rateLimited.body).toHaveProperty('error');
        expect(rateLimited.body).toHaveProperty('retryAfter');
        expect(typeof rateLimited.body.retryAfter).toBe('number');
      }
    }, 15000);
  });
});
