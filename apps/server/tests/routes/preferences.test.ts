import { beforeEach, describe, expect, it, mock } from 'bun:test';
import express from 'express';
import request from 'supertest';

// Shared mock query object — reset in beforeEach
const mockQuery: any = {
  select: mock().mockReturnThis(),
  upsert: mock().mockReturnThis(),
  update: mock().mockReturnThis(),
  eq: mock().mockReturnThis(),
  in: mock().mockReturnThis(),
  single: mock(),
  maybeSingle: mock(),
};
const from = mock(() => mockQuery);

mock.module('../../src/services/supabase', () => ({
  supabase: { from },
  authHelpers: {
    verifyToken: mock(async () => ({ id: 'user-123', email: 'test@example.com' })),
  },
}));

const { default: preferenceRoutes } = await import('../../src/routes/preferences');

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.headers.authorization = 'Bearer test-token';
  next();
});
app.use('/preferences', preferenceRoutes);

const ROW = {
  tone: 'friendly',
  response_style: 'concise',
  language: 'en',
  notification_enabled: true,
  loop_detection_enabled: false,
  preferences: {},
};

function resetMocks() {
  from.mockClear();
  Object.values(mockQuery).forEach((fn: any) => fn.mockReset());
  mockQuery.select.mockReturnThis();
  mockQuery.upsert.mockReturnThis();
  mockQuery.update.mockReturnThis();
  mockQuery.eq.mockReturnThis();
  mockQuery.in.mockReturnThis();
}

describe('GET /preferences — loop_detection_enabled', () => {
  beforeEach(resetMocks);

  it('returns the stored column, so the app can show a server-side OFF', async () => {
    mockQuery.single.mockResolvedValueOnce({ data: ROW, error: null });
    const res = await request(app).get('/preferences');
    expect(res.status).toBe(200);
    expect(res.body.data.loop_detection_enabled).toBe(false);
    expect(mockQuery.select.mock.calls[0][0]).toContain('loop_detection_enabled');
  });

  it('defaults to enabled when the user has no preferences row, matching the detector', async () => {
    mockQuery.single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });
    const res = await request(app).get('/preferences');
    expect(res.status).toBe(200);
    expect(res.body.data.loop_detection_enabled).toBe(true);
  });
});

describe('PUT /preferences — loop_detection_enabled', () => {
  beforeEach(resetMocks);

  it('writes the column the loop detector gates on', async () => {
    mockQuery.single.mockResolvedValueOnce({ data: { ...ROW, loop_detection_enabled: false }, error: null });
    const res = await request(app).put('/preferences').send({ loop_detection_enabled: false });
    expect(res.status).toBe(200);
    expect(res.body.data.loop_detection_enabled).toBe(false);
    expect(mockQuery.upsert).toHaveBeenCalledTimes(1);
    expect(mockQuery.upsert.mock.calls[0][0]).toEqual({ user_id: 'user-123', loop_detection_enabled: false });
    expect(mockQuery.upsert.mock.calls[0][1]).toEqual({ onConflict: 'user_id' });
  });

  it('can turn detection back on', async () => {
    mockQuery.single.mockResolvedValueOnce({ data: { ...ROW, loop_detection_enabled: true }, error: null });
    const res = await request(app).put('/preferences').send({ loop_detection_enabled: true });
    expect(res.status).toBe(200);
    expect(mockQuery.upsert.mock.calls[0][0].loop_detection_enabled).toBe(true);
  });

  it('leaves the column untouched when other fields are updated', async () => {
    mockQuery.single.mockResolvedValueOnce({ data: ROW, error: null });
    const res = await request(app).put('/preferences').send({ tone: 'casual' });
    expect(res.status).toBe(200);
    expect(mockQuery.upsert.mock.calls[0][0]).not.toHaveProperty('loop_detection_enabled');
  });

  it('rejects a non-boolean value', async () => {
    const res = await request(app).put('/preferences').send({ loop_detection_enabled: 'no' });
    expect(res.status).toBe(400);
    expect(mockQuery.upsert).not.toHaveBeenCalled();
  });
});
