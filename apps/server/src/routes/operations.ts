import { Router, Request, Response } from 'express';
import { serverConfig } from '../config';
import { requireAuth } from '../middleware/auth';
import { operationsMonitor } from '../services/operations-monitor';
import { type DbRow, supabase } from '../services/supabase';

const router = Router();

function requireOperationsAccess(req: Request, res: Response, next: () => void): void {
  const userId = req.user?.id;
  if (!userId || !serverConfig.operations.alertUserIds.includes(userId)) {
    res.status(403).json({ error: 'Operations access is not configured for this account' });
    return;
  }
  next();
}

router.get('/snapshot', requireAuth, requireOperationsAccess, (_req: Request, res: Response) => {
  res.json(operationsMonitor.getSnapshot());
});

router.post('/snapshot/refresh', requireAuth, requireOperationsAccess, async (_req: Request, res: Response) => {
  res.json(await operationsMonitor.runNow());
});

router.get('/incidents', requireAuth, requireOperationsAccess, async (_req: Request, res: Response) => {
  const { data, error } = await supabase
    .from('operations_incidents')
    .select('id,component,severity,title,status,first_detected_at,last_detected_at,resolved_at')
    .order('last_detected_at', { ascending: false })
    .limit(100);
  if (error) return res.status(500).json({ error: 'Could not load operations incidents' });
  return res.json({ incidents: (data || []).map((row: DbRow) => row) });
});

export default router;
