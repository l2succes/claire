import { beforeEach, describe, expect, it, mock } from 'bun:test';
import express from 'express';
import request from 'supertest';

const mockQuery: any = {
  select: mock().mockReturnThis(),
  insert: mock().mockReturnThis(),
  update: mock().mockReturnThis(),
  delete: mock().mockReturnThis(),
  eq: mock().mockReturnThis(),
  order: mock().mockReturnThis(),
  single: mock(),
};
const from = mock(() => mockQuery);

mock.module('../../src/services/supabase', () => ({
  supabase: { from },
  authHelpers: {
    verifyToken: mock(async () => ({ id: 'user-123', email: 'test@example.com' })),
  },
}));

const { default: autoReplyRoutes } = await import('../../src/routes/auto-reply');

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.headers.authorization = 'Bearer test-token';
  next();
});
app.use('/auto-reply', autoReplyRoutes);

const RULE_ID = '6f1c2b8e-3d4a-4f5b-9c6d-7e8f9a0b1c2d';

function resetMocks() {
  from.mockClear();
  Object.values(mockQuery).forEach((fn: any) => fn.mockReset());
  for (const key of ['select', 'insert', 'update', 'delete', 'eq', 'order']) {
    mockQuery[key].mockReturnThis();
  }
}

describe('PATCH /auto-reply/:id', () => {
  beforeEach(resetMocks);

  it('only forwards updatable fields to the update', async () => {
    mockQuery.single.mockResolvedValueOnce({ data: { id: RULE_ID, name: 'Renamed' }, error: null });

    const res = await request(app)
      .patch(`/auto-reply/${RULE_ID}`)
      .send({
        name: 'Renamed',
        enabled: false,
        max_per_day: 10,
        user_id: 'someone-else',
        id: 'another-id',
        created_at: '2000-01-01T00:00:00.000Z',
        sent_count: 999,
      });

    expect(res.status).toBe(200);
    expect(mockQuery.update).toHaveBeenCalledTimes(1);
    const payload = mockQuery.update.mock.calls[0][0];
    expect(payload).toMatchObject({ name: 'Renamed', enabled: false, max_per_day: 10 });
    expect(typeof payload.updated_at).toBe('string');
    expect(payload).not.toHaveProperty('user_id');
    expect(payload).not.toHaveProperty('id');
    expect(payload).not.toHaveProperty('created_at');
    expect(payload).not.toHaveProperty('sent_count');
    expect(Object.keys(payload).sort()).toEqual(['enabled', 'max_per_day', 'name', 'updated_at']);
  });

  it('scopes the update to the rule id and the authenticated user', async () => {
    mockQuery.single.mockResolvedValueOnce({ data: { id: RULE_ID }, error: null });

    await request(app).patch(`/auto-reply/${RULE_ID}`).send({ enabled: true, user_id: 'someone-else' });

    expect(mockQuery.eq.mock.calls).toEqual([
      ['id', RULE_ID],
      ['user_id', 'user-123'],
    ]);
  });

  it('rejects an invalid field value without writing', async () => {
    const res = await request(app).patch(`/auto-reply/${RULE_ID}`).send({ max_per_hour: 1000 });

    expect(res.status).toBe(400);
    expect(mockQuery.update).not.toHaveBeenCalled();
  });
});
