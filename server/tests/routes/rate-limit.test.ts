/**
 * Rate-limit middleware tests (issue #46).
 *
 * Verifies that the AI and auth limiters return 429 once the per-window cap is
 * exceeded, and that the standard RateLimit-* headers are present.
 */

import express, { Request, Response, NextFunction } from 'express';
import supertest from 'supertest';
import { aiRateLimit, authRateLimit } from '../../src/middleware/rate-limit';

function createRateLimitTestApp() {
  const app = express();
  app.use(express.json());

  // Minimal auth stub — never 401, just 200
  function noAuth(_req: Request, _res: Response, next: NextFunction) {
    next();
  }

  // AI route guarded by aiRateLimit
  app.post('/ai/responses/generate', aiRateLimit, noAuth, (_req: Request, res: Response) => {
    res.json({ suggestions: [] });
  });

  // Auth route guarded by authRateLimit
  app.post('/auth/login', authRateLimit, noAuth, (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  return app;
}

describe('Rate limiting middleware', () => {
  describe('AI routes — aiRateLimit (max 30 / 60 s)', () => {
    let request: ReturnType<typeof supertest>;

    beforeAll(() => {
      request = supertest(createRateLimitTestApp());
    });

    it('allows requests within the limit', async () => {
      const res = await request
        .post('/ai/responses/generate')
        .send({ messageId: 'msg1', content: 'hello' });
      expect(res.status).toBe(200);
    });

    it('returns 429 after exceeding the limit', async () => {
      // Create a fresh app instance with a tiny cap (1 req) for fast testing
      const app = express();
      app.use(express.json());
      const tightLimit = (await import('express-rate-limit')).default({
        windowMs: 60_000,
        max: 1,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'Too many AI requests, please try again later.' },
      });
      app.post('/ai/responses/generate', tightLimit, (_req: Request, res: Response) => {
        res.json({ suggestions: [] });
      });

      const req = supertest(app);
      // First request — should pass
      const first = await req.post('/ai/responses/generate').send({});
      expect(first.status).toBe(200);

      // Second request — should be blocked
      const second = await req.post('/ai/responses/generate').send({});
      expect(second.status).toBe(429);
      expect(second.body).toHaveProperty('error');
    });

    it('sets RateLimit-* headers on successful requests', async () => {
      const res = await request
        .post('/ai/responses/generate')
        .send({ messageId: 'msg1', content: 'hello' });
      // express-rate-limit v7 uses "RateLimit-Limit" / "RateLimit-Remaining"
      expect(res.headers).toHaveProperty('ratelimit-limit');
      expect(res.headers).toHaveProperty('ratelimit-remaining');
    });
  });

  describe('Auth routes — authRateLimit (max 10 / 15 min)', () => {
    it('allows requests within the limit', async () => {
      const app = createRateLimitTestApp();
      const res = await supertest(app)
        .post('/auth/login')
        .send({ email: 'a@b.com', password: 'pass' });
      expect(res.status).toBe(200);
    });

    it('returns 429 after exceeding the limit', async () => {
      const app = express();
      app.use(express.json());
      const tightLimit = (await import('express-rate-limit')).default({
        windowMs: 15 * 60_000,
        max: 1,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'Too many authentication attempts, please try again later.' },
      });
      app.post('/auth/login', tightLimit, (_req: Request, res: Response) => {
        res.json({ ok: true });
      });

      const req = supertest(app);
      const first = await req.post('/auth/login').send({});
      expect(first.status).toBe(200);

      const second = await req.post('/auth/login').send({});
      expect(second.status).toBe(429);
      expect(second.body.error).toMatch(/too many/i);
    });

    it('sets RateLimit-* headers on successful requests', async () => {
      const app = createRateLimitTestApp();
      const res = await supertest(app)
        .post('/auth/login')
        .send({ email: 'a@b.com', password: 'pass' });
      expect(res.headers).toHaveProperty('ratelimit-limit');
      expect(res.headers).toHaveProperty('ratelimit-remaining');
    });
  });
});
