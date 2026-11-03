import { describe, expect, it } from 'bun:test';
import express, { type Request } from 'express';
import request from 'supertest';
import { z } from 'zod';
import { validateRequest } from '../../src/middleware/validation';

type Seen = { body: unknown; query: unknown; params: unknown };

function appWith(path: string, method: 'get' | 'post', schema: z.ZodTypeAny) {
  const app = express();
  app.use(express.json());
  const seen: { last?: Seen } = {};
  app[method](path, validateRequest(schema), (req: Request, res) => {
    seen.last = { body: req.body, query: req.query, params: req.params };
    res.json(seen.last);
  });
  return { app, seen };
}

describe('validateRequest', () => {
  it('strips body keys the schema does not declare', async () => {
    const { app, seen } = appWith(
      '/items',
      'post',
      z.object({ body: z.object({ name: z.string() }) }),
    );

    const res = await request(app).post('/items').send({ name: 'a', user_id: 'other', role: 'admin' });

    expect(res.status).toBe(200);
    expect(seen.last?.body).toEqual({ name: 'a' });
  });

  it('passes coerced, transformed and defaulted query values to the handler', async () => {
    const { app, seen } = appWith(
      '/items',
      'get',
      z.object({
        query: z.object({
          cursor: z.coerce.number().int().min(0).default(0),
          limit: z.coerce.number().int().default(25),
          q: z.string().trim(),
        }),
      }),
    );

    const res = await request(app).get('/items?cursor=7&q=%20hello%20&extra=1');

    expect(res.status).toBe(200);
    expect(seen.last?.query).toEqual({ cursor: 7, limit: 25, q: 'hello' });
    expect(typeof (seen.last?.query as { cursor: unknown }).cursor).toBe('number');
  });

  it('applies body defaults', async () => {
    const { app, seen } = appWith(
      '/items',
      'post',
      z.object({ body: z.object({ name: z.string(), priority: z.string().default('medium') }) }),
    );

    await request(app).post('/items').send({ name: 'a' });

    expect(seen.last?.body).toEqual({ name: 'a', priority: 'medium' });
  });

  it('writes back params when the schema declares them', async () => {
    const { app, seen } = appWith(
      '/items/:id',
      'get',
      z.object({ params: z.object({ id: z.coerce.number() }) }),
    );

    const res = await request(app).get('/items/42');

    expect(res.status).toBe(200);
    expect(seen.last?.params).toEqual({ id: 42 });
  });

  it('leaves parts the schema does not declare untouched', async () => {
    const { app, seen } = appWith(
      '/items/:id',
      'post',
      z.object({ body: z.object({ name: z.string() }) }),
    );

    const res = await request(app).post('/items/abc?include=events').send({ name: 'a' });

    expect(res.status).toBe(200);
    expect(seen.last?.query).toEqual({ include: 'events' });
    expect(seen.last?.params).toEqual({ id: 'abc' });
  });

  it('rejects invalid input with 400 and does not call the handler', async () => {
    const { app, seen } = appWith(
      '/items',
      'post',
      z.object({ body: z.object({ name: z.string().min(1) }) }),
    );

    const res = await request(app).post('/items').send({ name: '' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(seen.last).toBeUndefined();
  });
});
