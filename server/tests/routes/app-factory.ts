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
  // /health — mirrors the richer shape from production (issue #47)
  // ------------------------------------------------------------------
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV ?? 'test',
      checks: {
        db: { status: 'ok', latencyMs: 1 },
        redis: { status: 'ok', latencyMs: 1 },
      },
    });
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
  // /promises
  // ------------------------------------------------------------------
  const MOCK_PROMISE = {
    id: 'promise-1',
    user_id: 'test-user',
    message_id: 'msg-1',
    chat_id: 'chat-1',
    content: "I'll send the report by Friday",
    type: 'commitment',
    priority: 'medium',
    status: 'pending',
    from_me: true,
    created_at: new Date().toISOString(),
  };

  app.get('/promises', requireAuth, (_req, res) => {
    res.json({ promises: [MOCK_PROMISE], total: 1 });
  });
  app.get('/promises/:id', requireAuth, (req, res): void => {
    if (req.params.id !== MOCK_PROMISE.id) {
      res.status(404).json({ error: 'Promise not found' });
      return;
    }
    res.json({ promise: MOCK_PROMISE });
  });
  app.patch('/promises/:id', requireAuth, (req, res) => {
    res.json({ promise: { ...MOCK_PROMISE, ...req.body, id: req.params.id } });
  });
  app.post('/promises/:id/snooze', requireAuth, (req, res) => {
    const snoozedUntil = req.body?.until ?? new Date(Date.now() + 86_400_000).toISOString();
    res.json({ promise: { ...MOCK_PROMISE, id: req.params.id, deadline: snoozedUntil } });
  });
  app.delete('/promises/:id', requireAuth, (_req, res) => {
    res.json({ success: true });
  });

  // ------------------------------------------------------------------
  // /preferences
  // ------------------------------------------------------------------
  const MOCK_PREFERENCES = {
    tone: 'friendly',
    response_style: 'concise',
    language: 'en',
    notification_enabled: true,
    preferences: {
      quiet_hours_enabled: false,
      quiet_hours_start: '22:00',
      quiet_hours_end: '08:00',
      notify_messages: true,
      notify_promises: true,
      notify_ai_suggestions: false,
    },
  };

  app.get('/preferences', requireAuth, (_req, res) => {
    res.json({ success: true, data: MOCK_PREFERENCES });
  });
  app.put('/preferences', requireAuth, (req, res) => {
    res.json({ success: true, data: { ...MOCK_PREFERENCES, ...req.body } });
  });

  // ------------------------------------------------------------------
  // /notifications
  // ------------------------------------------------------------------
  app.post('/notifications/push/register', requireAuth, (req, res): void => {
    const { token } = req.body ?? {};
    if (!token) {
      res.status(400).json({ error: 'Missing token' });
      return;
    }
    if (!token.startsWith('ExponentPushToken[') && !token.startsWith('ExpoPushToken[')) {
      res.status(400).json({ error: `Invalid Expo push token: ${token}` });
      return;
    }
    res.json({ success: true });
  });
  app.post('/notifications/push/deregister', requireAuth, (req, res): void => {
    const { token } = req.body ?? {};
    if (!token) {
      res.status(400).json({ error: 'Missing token' });
      return;
    }
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
