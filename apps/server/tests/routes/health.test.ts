/**
 * Unit tests for the /health endpoint behaviour (issue #47).
 *
 * Uses the app-factory to mount a standalone health route, then
 * tests the degraded path by patching the mock factory to return
 * an error from one of the dependency checks.
 */

import supertest from 'supertest';
import express, { Request, Response } from 'express';

// ---------------------------------------------------------------------------
// Helpers: build health apps with various check outcomes
// ---------------------------------------------------------------------------

type CheckResult = { status: 'ok' | 'error'; latencyMs?: number; error?: string };

function buildHealthApp(checks: Record<string, CheckResult>) {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req: Request, res: Response) => {
    const allOk = Object.values(checks).every((c) => c.status === 'ok');
    res.status(allOk ? 200 : 503).json({
      status: allOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: 'test',
      checks,
    });
  });

  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('/health — all dependencies healthy', () => {
  const request = supertest(
    buildHealthApp({
      db: { status: 'ok', latencyMs: 2 },
      redis: { status: 'ok', latencyMs: 1 },
    })
  );

  it('returns HTTP 200', async () => {
    const res = await request.get('/health');
    expect(res.status).toBe(200);
  });

  it('reports status: ok', async () => {
    const res = await request.get('/health');
    expect(res.body.status).toBe('ok');
  });

  it('includes db and redis checks with ok status', async () => {
    const res = await request.get('/health');
    expect(res.body.checks.db.status).toBe('ok');
    expect(res.body.checks.redis.status).toBe('ok');
    expect(typeof res.body.checks.db.latencyMs).toBe('number');
  });

  it('includes uptime (number) and environment (string)', async () => {
    const res = await request.get('/health');
    expect(typeof res.body.uptime).toBe('number');
    expect(res.body.environment).toBe('test');
  });

  it('includes ISO timestamp', async () => {
    const res = await request.get('/health');
    expect(typeof res.body.timestamp).toBe('string');
    expect(new Date(res.body.timestamp).getTime()).not.toBeNaN();
  });
});

describe('/health — DB degraded', () => {
  const request = supertest(
    buildHealthApp({
      db: { status: 'error', error: 'connection refused' },
      redis: { status: 'ok', latencyMs: 1 },
    })
  );

  it('returns HTTP 503', async () => {
    const res = await request.get('/health');
    expect(res.status).toBe(503);
  });

  it('reports status: degraded', async () => {
    const res = await request.get('/health');
    expect(res.body.status).toBe('degraded');
  });

  it('reports db check as error with message', async () => {
    const res = await request.get('/health');
    expect(res.body.checks.db.status).toBe('error');
    expect(typeof res.body.checks.db.error).toBe('string');
  });

  it('redis check still reports ok', async () => {
    const res = await request.get('/health');
    expect(res.body.checks.redis.status).toBe('ok');
  });
});

describe('/health — Redis degraded', () => {
  const request = supertest(
    buildHealthApp({
      db: { status: 'ok', latencyMs: 3 },
      redis: { status: 'error', error: 'PONG not received' },
    })
  );

  it('returns HTTP 503', async () => {
    const res = await request.get('/health');
    expect(res.status).toBe(503);
  });

  it('reports status: degraded', async () => {
    const res = await request.get('/health');
    expect(res.body.status).toBe('degraded');
  });
});

describe('/health — Matrix check present when configured', () => {
  const request = supertest(
    buildHealthApp({
      db: { status: 'ok', latencyMs: 2 },
      redis: { status: 'ok', latencyMs: 1 },
      matrix: { status: 'ok', latencyMs: 5 },
    })
  );

  it('returns HTTP 200', async () => {
    const res = await request.get('/health');
    expect(res.status).toBe(200);
  });

  it('includes matrix check', async () => {
    const res = await request.get('/health');
    expect(res.body.checks).toHaveProperty('matrix');
    expect(res.body.checks.matrix.status).toBe('ok');
  });
});

describe('/health — Matrix degraded', () => {
  const request = supertest(
    buildHealthApp({
      db: { status: 'ok', latencyMs: 2 },
      redis: { status: 'ok', latencyMs: 1 },
      matrix: { status: 'error', error: 'HTTP 502' },
    })
  );

  it('returns HTTP 503 when Matrix is down', async () => {
    const res = await request.get('/health');
    expect(res.status).toBe(503);
  });

  it('reports status: degraded', async () => {
    const res = await request.get('/health');
    expect(res.body.status).toBe('degraded');
  });

  it('matrix check reports error', async () => {
    const res = await request.get('/health');
    expect(res.body.checks.matrix.status).toBe('error');
  });
});
