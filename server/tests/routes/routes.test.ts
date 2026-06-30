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
// /promises
// ---------------------------------------------------------------------------
describe('/promises', () => {
  it('GET / — 401 without token', async () => {
    const res = await request.get('/promises');
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('GET / — 200 with valid token, returns array', async () => {
    const res = await request
      .get('/promises')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.promises)).toBe(true);
    expect(typeof res.body.total).toBe('number');
  });

  it('GET /:id — 200 for existing promise', async () => {
    const res = await request
      .get('/promises/promise-1')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(200);
    expect(res.body.promise).toHaveProperty('id', 'promise-1');
    expect(res.body.promise).toHaveProperty('status');
    expect(res.body.promise).toHaveProperty('content');
  });

  it('GET /:id — 404 for unknown promise', async () => {
    const res = await request
      .get('/promises/no-such-promise')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('PATCH /:id — 401 without token', async () => {
    const res = await request
      .patch('/promises/promise-1')
      .send({ status: 'completed' });
    expect(res.status).toBe(401);
  });

  it('PATCH /:id — 200 marks promise completed', async () => {
    const res = await request
      .patch('/promises/promise-1')
      .set('Authorization', 'Bearer valid-token')
      .send({ status: 'completed' });
    expect(res.status).toBe(200);
    expect(res.body.promise).toHaveProperty('status', 'completed');
  });

  it('POST /:id/snooze — 200 returns updated deadline', async () => {
    const until = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const res = await request
      .post('/promises/promise-1/snooze')
      .set('Authorization', 'Bearer valid-token')
      .send({ until });
    expect(res.status).toBe(200);
    expect(res.body.promise).toHaveProperty('deadline', until);
  });

  it('DELETE /:id — 401 without token', async () => {
    const res = await request.delete('/promises/promise-1');
    expect(res.status).toBe(401);
  });

  it('DELETE /:id — 200 with valid token', async () => {
    const res = await request
      .delete('/promises/promise-1')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// /preferences (notification prefs)
// ---------------------------------------------------------------------------
describe('/preferences', () => {
  it('GET / — 401 without token', async () => {
    const res = await request.get('/preferences');
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('GET / — 200 with valid token, returns notification fields', async () => {
    const res = await request
      .get('/preferences')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.notification_enabled).toBe('boolean');
    expect(typeof res.body.data.preferences.quiet_hours_enabled).toBe('boolean');
    expect(typeof res.body.data.preferences.quiet_hours_start).toBe('string');
    expect(typeof res.body.data.preferences.notify_messages).toBe('boolean');
    expect(typeof res.body.data.preferences.notify_promises).toBe('boolean');
    expect(typeof res.body.data.preferences.notify_ai_suggestions).toBe('boolean');
  });

  it('PUT / — 401 without token', async () => {
    const res = await request
      .put('/preferences')
      .send({ notification_enabled: false });
    expect(res.status).toBe(401);
  });

  it('PUT / — 200 persists notification_enabled', async () => {
    const res = await request
      .put('/preferences')
      .set('Authorization', 'Bearer valid-token')
      .send({ notification_enabled: false });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.notification_enabled).toBe(false);
  });

  it('PUT / — 200 persists quiet_hours preferences', async () => {
    const res = await request
      .put('/preferences')
      .set('Authorization', 'Bearer valid-token')
      .send({
        preferences: {
          quiet_hours_enabled: true,
          quiet_hours_start: '23:00',
          quiet_hours_end: '07:00',
          notify_messages: false,
          notify_promises: true,
          notify_ai_suggestions: false,
        },
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.preferences.quiet_hours_enabled).toBe(true);
    expect(res.body.data.preferences.quiet_hours_start).toBe('23:00');
    expect(res.body.data.preferences.notify_messages).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// /push-tokens
// ---------------------------------------------------------------------------
describe('/push-tokens', () => {
  it('POST / — 401 without token', async () => {
    const res = await request
      .post('/push-tokens')
      .send({ token: 'ExponentPushToken[abc123]' });
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('POST / — 400 missing token field', async () => {
    const res = await request
      .post('/push-tokens')
      .set('Authorization', 'Bearer valid-token')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('POST / — 200 persists valid token', async () => {
    const res = await request
      .post('/push-tokens')
      .set('Authorization', 'Bearer valid-token')
      .send({ token: 'ExponentPushToken[abc123]' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
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
