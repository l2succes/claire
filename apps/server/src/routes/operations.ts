import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { operationsMonitor } from '../services/operations-monitor';
import { type DbRow, supabase } from '../services/supabase';
import { recordOperationsAudit } from '../services/operations-audit';
import { operationsTelemetry } from '../services/operations-telemetry';

const router = Router();

async function requireOperationsAccess(req: Request, res: Response, next: () => void): Promise<void> {
  try {
    const email = typeof req.user?.email === 'string' ? req.user.email.trim().toLowerCase() : '';
    if (!email) { res.status(403).json({ error: 'A verified email is required for Operations access' }); return; }
    const { data, error } = await supabase.from('operations_admins').select('role').eq('email', email).maybeSingle();
    if (error || !data) { res.status(403).json({ error: 'This email is not allowed to access Operations' }); return; }
    req.user.operationsRole = data.role;
    next();
  } catch {
    res.status(500).json({ error: 'Could not verify Operations access' });
  }
}

function requireOperationsOwner(req: Request, res: Response, next: () => void): void {
  if (req.user?.operationsRole !== 'owner') { res.status(403).json({ error: 'Owner access is required' }); return; }
  next();
}

router.get('/snapshot', requireAuth, requireOperationsAccess, (_req: Request, res: Response) => {
  if (_req.user?.id) void recordOperationsAudit({ actorUserId: _req.user.id, action: 'snapshot_viewed' });
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
  if (_req.user?.id) void recordOperationsAudit({ actorUserId: _req.user.id, action: 'incidents_viewed' });
  return res.json({ incidents: (data || []).map((row: DbRow) => row) });
});

router.get('/telemetry', requireAuth, requireOperationsAccess, async (req: Request, res: Response) => {
  const suppliedRange = Number(req.query.rangeMinutes);
  const rangeMinutes = [15, 60, 360, 1440].includes(suppliedRange) ? suppliedRange : 60;
  try {
    const telemetry = await operationsTelemetry.summary(rangeMinutes);
    if (req.user?.id) void recordOperationsAudit({ actorUserId: req.user.id, action: 'telemetry_viewed', metadata: { rangeMinutes } });
    return res.json(telemetry);
  } catch {
    return res.status(500).json({ error: 'Could not load Operations telemetry' });
  }
});

router.get('/admins', requireAuth, requireOperationsAccess, async (_req: Request, res: Response) => {
  const { data, error } = await supabase.from('operations_admins').select('id,email,role,created_at').order('email');
  if (error) return res.status(500).json({ error: 'Could not load Operations access list' });
  if (_req.user?.id) void recordOperationsAudit({ actorUserId: _req.user.id, action: 'admins_viewed' });
  return res.json({ admins: data || [] });
});

router.post('/admins', requireAuth, requireOperationsAccess, requireOperationsOwner, async (req: Request, res: Response) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const role = req.body?.role === 'owner' || req.body?.role === 'operator' ? req.body.role : 'viewer';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'A valid email is required' });
  const { data, error } = await supabase.from('operations_admins').upsert({ email, role, updated_at: new Date().toISOString() }, { onConflict: 'email' }).select('id,email,role,created_at').single();
  if (error) return res.status(500).json({ error: 'Could not update Operations access list' });
  if (req.user?.id) void recordOperationsAudit({ actorUserId: req.user.id, action: 'admin_granted', target: email, metadata: { role } });
  return res.status(201).json({ admin: data });
});

router.delete('/admins/:id', requireAuth, requireOperationsAccess, requireOperationsOwner, async (req: Request, res: Response) => {
  const { data: target, error: targetError } = await supabase.from('operations_admins').select('id,role').eq('id', req.params.id).maybeSingle();
  if (targetError || !target) return res.status(404).json({ error: 'Access entry was not found' });
  if (target.role === 'owner') {
    const { count } = await supabase.from('operations_admins').select('id', { count: 'exact', head: true }).eq('role', 'owner');
    if ((count || 0) <= 1) return res.status(409).json({ error: 'Keep at least one Operations owner' });
  }
  const { error } = await supabase.from('operations_admins').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: 'Could not remove Operations access' });
  if (req.user?.id) void recordOperationsAudit({ actorUserId: req.user.id, action: 'admin_revoked', target: target.id });
  return res.status(204).send();
});

export default router;
