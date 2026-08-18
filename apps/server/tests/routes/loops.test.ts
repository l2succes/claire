import { beforeEach, describe, expect, it, mock } from 'bun:test';
import express from 'express';
import request from 'supertest';

// Shared mock query object — reset in beforeEach
const mockQuery: any = {
  select: mock().mockReturnThis(),
  insert: mock().mockReturnThis(),
  update: mock().mockReturnThis(),
  delete: mock().mockReturnThis(),
  eq: mock().mockReturnThis(),
  order: mock().mockReturnThis(),
  range: mock().mockReturnThis(),
  single: mock(),
};

mock.module('../../src/services/supabase', () => ({
  supabase: {
    from: mock(() => mockQuery),
  },
  authHelpers: {
    verifyToken: mock(async () => ({
      id: 'user-123',
      email: 'test@example.com',
    })),
  },
}));

const { default: loopRoutes } = await import('../../src/routes/loops');

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.headers.authorization = 'Bearer test-token';
  next();
});
app.use('/loops', loopRoutes);

const VALID_UUID = '00000000-0000-0000-0000-000000000001';

function resetMocks() {
  Object.values(mockQuery).forEach((fn: any) => fn.mockReset());
  // Re-apply chaining defaults
  mockQuery.select.mockReturnThis();
  mockQuery.insert.mockReturnThis();
  mockQuery.update.mockReturnThis();
  mockQuery.delete.mockReturnThis();
  mockQuery.eq.mockReturnThis();
  mockQuery.order.mockReturnThis();
  mockQuery.range.mockReturnThis();
}

// ---------------------------------------------------------------------------
describe('GET /loops', () => {
  beforeEach(resetMocks);

  it('returns 200 with an empty list', async () => {
    mockQuery.range.mockResolvedValueOnce({ data: [], error: null, count: 0 });
    const res = await request(app).get('/loops');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('accepts valid status filter', async () => {
    mockQuery.range.mockResolvedValueOnce({ data: [], error: null, count: 0 });
    const res = await request(app).get('/loops?status=open');
    expect(res.status).toBe(200);
  });

  it('rejects invalid status filter with 400', async () => {
    const res = await request(app).get('/loops?status=invalid_status');
    expect(res.status).toBe(400);
  });

  it('returns 500 on database error', async () => {
    mockQuery.range.mockResolvedValueOnce({ data: null, error: { message: 'db error' }, count: 0 });
    const res = await request(app).get('/loops');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('GET /loops/:id', () => {
  beforeEach(resetMocks);

  it('returns 400 for non-UUID id', async () => {
    const res = await request(app).get('/loops/not-a-uuid');
    expect(res.status).toBe(400);
  });

  it('returns 404 when loop not found or not owned', async () => {
    mockQuery.single.mockResolvedValueOnce({ data: null, error: { message: 'not found' } });
    const res = await request(app).get(`/loops/${VALID_UUID}`);
    expect(res.status).toBe(404);
  });

  it('returns 200 with loop data when found', async () => {
    const mockLoop = { id: VALID_UUID, user_id: 'user-123', content: 'call tomorrow', status: 'open' };
    mockQuery.single.mockResolvedValueOnce({ data: mockLoop, error: null });
    const res = await request(app).get(`/loops/${VALID_UUID}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(VALID_UUID);
  });
});

// ---------------------------------------------------------------------------
describe('PATCH /loops/:id', () => {
  const mockLoop = { id: VALID_UUID, user_id: 'user-123', content: 'call tomorrow', status: 'open', completed_at: null };

  beforeEach(resetMocks);

  it('returns 400 for empty body', async () => {
    const res = await request(app).patch(`/loops/${VALID_UUID}`).send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 when loop not found', async () => {
    mockQuery.single.mockResolvedValueOnce({ data: null, error: { message: 'not found' } });
    const res = await request(app).patch(`/loops/${VALID_UUID}`).send({ status: 'done' });
    expect(res.status).toBe(404);
  });

  it('returns 200 on successful status update', async () => {
    const updated = { ...mockLoop, status: 'done', completed_at: new Date().toISOString() };
    mockQuery.single
      .mockResolvedValueOnce({ data: mockLoop, error: null })   // getOwnedLoop
      .mockResolvedValueOnce({ data: updated, error: null });       // update + select
    const res = await request(app).patch(`/loops/${VALID_UUID}`).send({ status: 'done' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('done');
  });

  it('blocks cross-user access — returns 404', async () => {
    mockQuery.single.mockResolvedValueOnce({ data: null, error: null }); // null = not owned
    const res = await request(app).patch(`/loops/${VALID_UUID}`).send({ status: 'done' });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
describe('POST /loops/:id/snooze', () => {
  const mockLoop = { id: VALID_UUID, user_id: 'user-123', content: 'call tomorrow', status: 'open' };
  const snoozeUntil = new Date(Date.now() + 86400000).toISOString();

  beforeEach(resetMocks);

  it('returns 400 for missing snooze_until', async () => {
    const res = await request(app).post(`/loops/${VALID_UUID}/snooze`).send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 for non-datetime snooze_until', async () => {
    const res = await request(app).post(`/loops/${VALID_UUID}/snooze`).send({ snooze_until: 'tomorrow' });
    expect(res.status).toBe(400);
  });

  it('returns 404 when loop not found', async () => {
    mockQuery.single.mockResolvedValueOnce({ data: null, error: { message: 'not found' } });
    const res = await request(app).post(`/loops/${VALID_UUID}/snooze`).send({ snooze_until: snoozeUntil });
    expect(res.status).toBe(404);
  });

  it('returns 200 on successful snooze', async () => {
    const snoozed = { ...mockLoop, snoozed_until: snoozeUntil, status: 'snoozed' };
    mockQuery.single
      .mockResolvedValueOnce({ data: mockLoop, error: null })
      .mockResolvedValueOnce({ data: snoozed, error: null });
    const res = await request(app).post(`/loops/${VALID_UUID}/snooze`).send({ snooze_until: snoozeUntil });
    expect(res.status).toBe(200);
    expect(res.body.data.snoozed_until).toBe(snoozeUntil);
  });

  it('snoozes without overwriting the deadline', async () => {
    // The original endpoint wrote snooze_until into `deadline`, so a loop
    // snoozed twice lost the date the user actually committed to.
    const originalDeadline = new Date(Date.now() + 3600_000).toISOString();
    const withDeadline = { ...mockLoop, deadline: originalDeadline };
    mockQuery.single
      .mockResolvedValueOnce({ data: withDeadline, error: null })
      .mockResolvedValueOnce({
        data: { ...withDeadline, snoozed_until: snoozeUntil, status: 'snoozed' },
        error: null,
      });

    await request(app).post(`/loops/${VALID_UUID}/snooze`).send({ snooze_until: snoozeUntil });

    const updatePayload = mockQuery.update.mock.calls.at(-1)?.[0];
    expect(updatePayload).toEqual({ snoozed_until: snoozeUntil, status: 'snoozed' });
    expect(updatePayload).not.toHaveProperty('deadline');
  });
});

// ---------------------------------------------------------------------------
describe('DELETE /loops/:id', () => {
  const mockLoop = { id: VALID_UUID, user_id: 'user-123', content: 'call tomorrow', status: 'open' };

  beforeEach(resetMocks);

  it('returns 404 when loop not found', async () => {
    mockQuery.single.mockResolvedValueOnce({ data: null, error: { message: 'not found' } });
    const res = await request(app).delete(`/loops/${VALID_UUID}`);
    expect(res.status).toBe(404);
  });

  it('returns 204 on successful soft-delete', async () => {
    // getOwnedLoop uses: .select().eq(×2).single()
    mockQuery.single.mockResolvedValueOnce({ data: mockLoop, error: null });
    // delete uses: .update().eq(×2) — awaited on the whole chain
    // Track call count: calls 1-2 from getOwnedLoop, calls 3-4 from the delete update
    let eqCallCount = 0;
    mockQuery.eq.mockImplementation(() => {
      eqCallCount++;
      if (eqCallCount === 4) return Promise.resolve({ error: null });
      return mockQuery;
    });
    const res = await request(app).delete(`/loops/${VALID_UUID}`);
    expect(res.status).toBe(204);
  });

  it('blocks cross-user access — returns 404', async () => {
    mockQuery.single.mockResolvedValueOnce({ data: null, error: null }); // null = not owned
    const res = await request(app).delete(`/loops/${VALID_UUID}`);
    expect(res.status).toBe(404);
  });
});
