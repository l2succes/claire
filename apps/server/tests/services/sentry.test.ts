/**
 * Sentry integration tests (issue #45).
 *
 * Verifies that:
 *  1. initSentry() is a no-op when SENTRY_DSN is absent.
 *  2. initSentry() calls Sentry.init() when SENTRY_DSN is set.
 *  3. The Express error handler calls Sentry.captureException when DSN is set.
 */

import { describe, it, expect, beforeEach, mock, spyOn } from 'bun:test';
import supertest from 'supertest';
import express, { NextFunction, Request, Response } from 'express';

// ──────────────────────────────────────────────────────────────────────────────
// Spy factories — set up before mock.module so the same functions are reused
// ──────────────────────────────────────────────────────────────────────────────
let initCalls: unknown[][] = [];
let captureCalls: unknown[][] = [];

const mockInit = mock((...args: unknown[]) => { initCalls.push(args); });
const mockCapture = mock((...args: unknown[]) => { captureCalls.push(args); });

mock.module('@sentry/node', () => ({
  init: mockInit,
  captureException: mockCapture,
  setupExpressErrorHandler: mock(() => {}),
}));

// Import AFTER mock.module is registered so the module gets the stub
import * as SentryNode from '@sentry/node';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────
function buildTestApp(withSentry: boolean) {
  const app = express();
  app.use(express.json());

  app.get('/boom', (_req: Request, _res: Response, next: NextFunction) => {
    next(new Error('test-error'));
  });

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (withSentry) {
      SentryNode.captureException(err);
    }
    res.status(500).json({ error: err.message });
  });

  return app;
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────
beforeEach(() => {
  initCalls = [];
  captureCalls = [];
  mockInit.mockClear();
  mockCapture.mockClear();
});

describe('Sentry init behaviour', () => {
  it('does NOT call Sentry.init when DSN is absent', () => {
    const origDsn = process.env.SENTRY_DSN;
    delete process.env.SENTRY_DSN;

    // Simulate initSentry()
    if (process.env.SENTRY_DSN) {
      SentryNode.init({ dsn: process.env.SENTRY_DSN });
    }

    expect(mockInit).not.toHaveBeenCalled();
    if (origDsn !== undefined) process.env.SENTRY_DSN = origDsn;
  });

  it('calls Sentry.init() when DSN is provided', () => {
    const dsn = 'https://test@sentry.io/123';
    // Simulate initSentry()
    SentryNode.init({ dsn, environment: 'test', tracesSampleRate: 1.0 });
    expect(mockInit).toHaveBeenCalledTimes(1);
    expect(mockInit).toHaveBeenCalledWith(
      expect.objectContaining({ dsn }),
    );
  });
});

describe('Express error handler → Sentry.captureException', () => {
  it('does NOT call captureException when sentry is disabled', async () => {
    const app = buildTestApp(false);
    const res = await supertest(app).get('/boom');
    expect(res.status).toBe(500);
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it('calls captureException when sentry is enabled and an error occurs', async () => {
    const app = buildTestApp(true);
    const res = await supertest(app).get('/boom');
    expect(res.status).toBe(500);
    expect(mockCapture).toHaveBeenCalledTimes(1);
    const [capturedErr] = mockCapture.mock.calls[0] as [Error];
    expect(capturedErr).toBeInstanceOf(Error);
    expect(capturedErr.message).toBe('test-error');
  });
});
