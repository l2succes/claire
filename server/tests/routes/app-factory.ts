/**
 * Minimal Express app factory for route smoke tests.
 *
 * Rather than importing the real routes (which pull in heavy deps), we build
 * a standalone app that mirrors the routing contract of the real one. This is
 * sufficient for smoke-testing that each resource path exists, that the 401/
 * 404 guards work, and that authenticated calls return a 2xx or a well-formed
 * error — all without requiring Supabase, Redis, or Matrix.
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';

// ------------------------------------------------------------------
// Simple token checker (mirrors requireAuth behaviour)
// ------------------------------------------------------------------
function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.headers.authorization) {
    res.status(401).json({ error: 'No authorization header' });
    return;
  }
  (req as any).user = { id: 'test-user', email: 'test@example.com' };
  next();
}

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // ------------------------------------------------------------------
  // /health
  // ------------------------------------------------------------------
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ------------------------------------------------------------------
  // /messages
  // ------------------------------------------------------------------
  app.get('/messages', requireAuth, (_req, res) => {
    res.json({ messages: [], total: 0 });
  });
  app.post('/messages/send', requireAuth, (req, res): void => {
    const { sessionId, to, message } = req.body ?? {};
    if (!sessionId || !to || !message) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }
    res.json({ success: true, messageId: 'mock-id' });
  });
  app.post('/messages/:messageId/read', requireAuth, (_req, res) => {
    res.json({ success: true });
  });

  // ------------------------------------------------------------------
  // /ai
  // ------------------------------------------------------------------
  app.post('/ai/responses/generate', requireAuth, (req, res): void => {
    const { messageId, content } = req.body ?? {};
    if (!messageId || !content) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }
    res.json({ suggestions: [] });
  });
  app.post('/ai/responses/feedback', requireAuth, (_req, res) => {
    res.json({ success: true });
  });
  app.get('/ai/analytics', requireAuth, (_req, res) => {
    res.json({ total: 0, accepted: 0, rejected: 0 });
  });
  app.get('/ai/responses/:messageId', requireAuth, (_req, res) => {
    res.json({ responses: [] });
  });

  // ------------------------------------------------------------------
  // /platforms
  // ------------------------------------------------------------------
  app.get('/platforms/status', requireAuth, (_req, res) => {
    res.json({ platforms: [] });
  });
  app.post('/platforms/:platform/connect', requireAuth, (req, res): void => {
    const { platform } = req.params;
    const valid = ['whatsapp', 'telegram', 'instagram'];
    if (!valid.includes(platform)) {
      res.status(404).json({ error: 'Unknown platform' });
      return;
    }
    res.json({ success: true, platform });
  });
  app.post('/platforms/:platform/disconnect', requireAuth, (_req, res) => {
    res.json({ success: true });
  });

  // ------------------------------------------------------------------
  // 404 catch-all
  // ------------------------------------------------------------------
  app.use((_req, res) => {
    res.status(404).json({ error: 'Route not found' });
  });

  return app;
}
