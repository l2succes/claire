/**
 * Route smoke tests — supertest harness (issue #13).
 *
 * Uses the lightweight app-factory (no real Supabase/Redis/adapters).
 * Compatible with both Jest (CI) and bun test (local dev).
 *
 * Verifies for each resource group:
 *   • Unauthenticated requests → 401
 *   • Authenticated requests   → 2xx with expected shape
 *   • Unknown routes           → 404
 */

import supertest from 'supertest';
import { createApp } from './app-factory';

let request: ReturnType<typeof supertest>;

beforeAll(() => {
  request = supertest(createApp());
});

// ---------------------------------------------------------------------------
// /health
// ---------------------------------------------------------------------------
describe('GET /health', () => {
  it('returns 200 with status ok (no auth required)', async () => {
    const res = await request.get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.timestamp).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// /messages
// ---------------------------------------------------------------------------
describe('/messages', () => {
  it('GET / — 401 without token', async () => {
    const res = await request.get('/messages');
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('GET / — 200 with valid token', async () => {
    const res = await request
      .get('/messages')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.messages)).toBe(true);
  });

  it('POST /send — 401 without token', async () => {
    const res = await request.post('/messages/send').send({
      sessionId: 's1',
      to: '+1234567890',
      message: 'hello',
    });
    expect(res.status).toBe(401);
  });

  it('POST /send — 400 missing fields', async () => {
    const res = await request
      .post('/messages/send')
      .set('Authorization', 'Bearer valid-token')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('POST /send — 200 with required fields', async () => {
    const res = await request
      .post('/messages/send')
      .set('Authorization', 'Bearer valid-token')
      .send({ sessionId: 's1', to: '+1234567890', message: 'hello' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// /ai
// ---------------------------------------------------------------------------
describe('/ai', () => {
  it('POST /responses/generate — 401 without token', async () => {
    const res = await request
      .post('/ai/responses/generate')
      .send({ messageId: 'msg1', content: 'hello' });
    expect(res.status).toBe(401);
  });

  it('POST /responses/generate — 400 missing fields', async () => {
    const res = await request
      .post('/ai/responses/generate')
      .set('Authorization', 'Bearer valid-token')
      .send({});
    expect(res.status).toBe(400);
  });

  it('POST /responses/generate — 200 with valid payload', async () => {
    const res = await request
      .post('/ai/responses/generate')
      .set('Authorization', 'Bearer valid-token')
      .send({ messageId: 'msg1', content: 'hello' });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.suggestions)).toBe(true);
  });

  it('GET /analytics — 401 without token', async () => {
    const res = await request.get('/ai/analytics');
    expect(res.status).toBe(401);
  });

  it('GET /analytics — 200 with valid token', async () => {
    const res = await request
      .get('/ai/analytics')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(200);
    expect(typeof res.body.total).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// /platforms
// ---------------------------------------------------------------------------
describe('/platforms', () => {
  it('GET /status — 401 without token', async () => {
    const res = await request.get('/platforms/status');
    expect(res.status).toBe(401);
  });

  it('GET /status — 200 with valid token', async () => {
    const res = await request
      .get('/platforms/status')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.platforms)).toBe(true);
  });

  it('POST /whatsapp/connect — 401 without token', async () => {
    const res = await request.post('/platforms/whatsapp/connect').send({});
    expect(res.status).toBe(401);
  });

  it('POST /whatsapp/connect — 200 with valid token', async () => {
    const res = await request
      .post('/platforms/whatsapp/connect')
      .set('Authorization', 'Bearer valid-token')
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.platform).toBe('whatsapp');
  });

  it('POST /unknown-platform/connect — 404', async () => {
    const res = await request
      .post('/platforms/unknown-platform/connect')
      .set('Authorization', 'Bearer valid-token')
      .send({});
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// 404 catch-all
// ---------------------------------------------------------------------------
describe('404 handler', () => {
  it('unknown route returns 404', async () => {
    const res = await request.get('/this-route-does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('POST to unknown route returns 404', async () => {
    const res = await request.post('/no-such-endpoint').send({});
    expect(res.status).toBe(404);
  });
});
