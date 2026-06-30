import express from 'express';
import request from 'supertest';

// Shared mock query object — reset in beforeEach
const mockQuery: any = {
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  range: jest.fn().mockReturnThis(),
  single: jest.fn(),
};

// Mock supabase BEFORE importing the router under test
jest.mock('../../src/services/supabase', () => ({
  supabase: {
    from: jest.fn(() => mockQuery),
  },
}));

// Mock auth middleware to inject a user
jest.mock('../../src/middleware/auth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-123' };
    next();
  },
}));

// Import after mocks are registered
import promiseRoutes from '../../src/routes/promises';

const app = express();
app.use(express.json());
app.use('/promises', promiseRoutes);

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
describe('GET /promises', () => {
  beforeEach(resetMocks);

  it('returns 200 with an empty list', async () => {
    mockQuery.range.mockResolvedValueOnce({ data: [], error: null, count: 0 });
    const res = await request(app).get('/promises');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('accepts valid status filter', async () => {
    mockQuery.range.mockResolvedValueOnce({ data: [], error: null, count: 0 });
    const res = await request(app).get('/promises?status=pending');
    expect(res.status).toBe(200);
  });

  it('rejects invalid status filter with 400', async () => {
    const res = await request(app).get('/promises?status=invalid_status');
    expect(res.status).toBe(400);
  });

  it('returns 500 on database error', async () => {
    mockQuery.range.mockResolvedValueOnce({ data: null, error: { message: 'db error' }, count: 0 });
    const res = await request(app).get('/promises');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('GET /promises/:id', () => {
  beforeEach(resetMocks);

  it('returns 400 for non-UUID id', async () => {
    const res = await request(app).get('/promises/not-a-uuid');
    expect(res.status).toBe(400);
  });

  it('returns 404 when promise not found or not owned', async () => {
    mockQuery.single.mockResolvedValueOnce({ data: null, error: { message: 'not found' } });
    const res = await request(app).get(`/promises/${VALID_UUID}`);
    expect(res.status).toBe(404);
  });

  it('returns 200 with promise data when found', async () => {
    const mockPromise = { id: VALID_UUID, user_id: 'user-123', content: 'call tomorrow', status: 'pending' };
    mockQuery.single.mockResolvedValueOnce({ data: mockPromise, error: null });
    const res = await request(app).get(`/promises/${VALID_UUID}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(VALID_UUID);
  });
});

// ---------------------------------------------------------------------------
describe('PATCH /promises/:id', () => {
  const mockPromise = { id: VALID_UUID, user_id: 'user-123', content: 'call tomorrow', status: 'pending', completed_at: null };

  beforeEach(resetMocks);

  it('returns 400 for empty body', async () => {
    const res = await request(app).patch(`/promises/${VALID_UUID}`).send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 when promise not found', async () => {
    mockQuery.single.mockResolvedValueOnce({ data: null, error: { message: 'not found' } });
    const res = await request(app).patch(`/promises/${VALID_UUID}`).send({ status: 'completed' });
    expect(res.status).toBe(404);
  });

  it('returns 200 on successful status update', async () => {
    const updated = { ...mockPromise, status: 'completed', completed_at: new Date().toISOString() };
    mockQuery.single
      .mockResolvedValueOnce({ data: mockPromise, error: null })   // getOwnedPromise
      .mockResolvedValueOnce({ data: updated, error: null });       // update + select
    const res = await request(app).patch(`/promises/${VALID_UUID}`).send({ status: 'completed' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('completed');
  });

  it('blocks cross-user access — returns 404', async () => {
    mockQuery.single.mockResolvedValueOnce({ data: null, error: null }); // null = not owned
    const res = await request(app).patch(`/promises/${VALID_UUID}`).send({ status: 'completed' });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
describe('POST /promises/:id/snooze', () => {
  const mockPromise = { id: VALID_UUID, user_id: 'user-123', content: 'call tomorrow', status: 'pending' };
  const snoozeUntil = new Date(Date.now() + 86400000).toISOString();

  beforeEach(resetMocks);

  it('returns 400 for missing snooze_until', async () => {
    const res = await request(app).post(`/promises/${VALID_UUID}/snooze`).send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 for non-datetime snooze_until', async () => {
    const res = await request(app).post(`/promises/${VALID_UUID}/snooze`).send({ snooze_until: 'tomorrow' });
    expect(res.status).toBe(400);
  });

  it('returns 404 when promise not found', async () => {
    mockQuery.single.mockResolvedValueOnce({ data: null, error: { message: 'not found' } });
    const res = await request(app).post(`/promises/${VALID_UUID}/snooze`).send({ snooze_until: snoozeUntil });
    expect(res.status).toBe(404);
  });

  it('returns 200 on successful snooze', async () => {
    const snoozed = { ...mockPromise, deadline: snoozeUntil, status: 'pending' };
    mockQuery.single
      .mockResolvedValueOnce({ data: mockPromise, error: null })
      .mockResolvedValueOnce({ data: snoozed, error: null });
    const res = await request(app).post(`/promises/${VALID_UUID}/snooze`).send({ snooze_until: snoozeUntil });
    expect(res.status).toBe(200);
    expect(res.body.data.deadline).toBe(snoozeUntil);
  });
});

// ---------------------------------------------------------------------------
describe('DELETE /promises/:id', () => {
  const mockPromise = { id: VALID_UUID, user_id: 'user-123', content: 'call tomorrow', status: 'pending' };

  beforeEach(resetMocks);

  it('returns 404 when promise not found', async () => {
    mockQuery.single.mockResolvedValueOnce({ data: null, error: { message: 'not found' } });
    const res = await request(app).delete(`/promises/${VALID_UUID}`);
    expect(res.status).toBe(404);
  });

  it('returns 204 on successful soft-delete', async () => {
    // getOwnedPromise uses: .select().eq(×2).single()
    mockQuery.single.mockResolvedValueOnce({ data: mockPromise, error: null });
    // delete uses: .update().eq(×2) — awaited on the whole chain
    // Track call count: calls 1-2 from getOwnedPromise, calls 3-4 from the delete update
    let eqCallCount = 0;
    mockQuery.eq.mockImplementation(() => {
      eqCallCount++;
      if (eqCallCount === 4) return Promise.resolve({ error: null });
      return mockQuery;
    });
    const res = await request(app).delete(`/promises/${VALID_UUID}`);
    expect(res.status).toBe(204);
  });

  it('blocks cross-user access — returns 404', async () => {
    mockQuery.single.mockResolvedValueOnce({ data: null, error: null }); // null = not owned
    const res = await request(app).delete(`/promises/${VALID_UUID}`);
    expect(res.status).toBe(404);
  });
});
