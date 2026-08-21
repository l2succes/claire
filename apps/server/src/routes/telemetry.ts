import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { operationsTelemetry } from '../services/operations-telemetry';

const router = Router();
const allowedPlatforms = new Set(['whatsapp', 'telegram', 'instagram', 'imessage', 'mock']);
const allowedStates = new Set(['connected', 'disconnected', 'acknowledged']);

// This intentionally accepts no message id, content, device id, contact, or
// raw realtime payload. It is a liveness signal, not client analytics.
router.post('/client-state', requireAuth, async (req: Request, res: Response) => {
  const state = typeof req.body?.state === 'string' ? req.body.state : '';
  const platform = typeof req.body?.platform === 'string' ? req.body.platform : 'mock';
  if (!req.user?.id || !allowedStates.has(state) || !allowedPlatforms.has(platform)) {
    return res.status(400).json({ error: 'Invalid telemetry signal' });
  }
  await operationsTelemetry.record({
    traceSource: `client:${req.user.id}:${platform}:${Math.floor(Date.now() / 60_000)}`,
    userId: req.user.id,
    platform,
    direction: 'system',
    stage: 'client_ack',
    outcome: state,
  });
  return res.status(202).json({ accepted: true });
});

export default router;
