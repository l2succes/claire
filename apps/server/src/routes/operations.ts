import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { operationsMonitor } from '../services/operations-monitor';
import { type DbRow, supabase } from '../services/supabase';
import { recordOperationsAudit } from '../services/operations-audit';
import { operationsTelemetry } from '../services/operations-telemetry';
import { getOperationsBridgeSnapshot } from '../services/operations-bridges';
import { getOperationsUserDirectory } from '../services/operations-users';
import { pseudonymousOperationsRef } from '../services/operations-privacy';

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

function requireOperationsOperator(req: Request, res: Response, next: () => void): void {
  if (req.user?.operationsRole !== 'owner' && req.user?.operationsRole !== 'operator') {
    res.status(403).json({ error: 'Operator access is required to view alert reports' });
    return;
  }
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

router.get('/alerts/:alertId', requireAuth, requireOperationsAccess, requireOperationsOperator, async (req: Request, res: Response) => {
  const { data, error } = await supabase
    .from('operations_alert_reports')
    .select('id,event_type,title,summary,user_id,user_email,screen,request_method,request_path,http_status,platform,session_id,created_at')
    .eq('id', req.params.alertId)
    .maybeSingle();
  if (error) return res.status(500).json({ error: 'Could not load the Operations alert report' });
  if (!data) return res.status(404).json({ error: 'Operations alert report was not found' });
  if (req.user?.id) void recordOperationsAudit({ actorUserId: req.user.id, action: 'alert_viewed', target: req.params.alertId, metadata: { eventType: String(data.event_type) } });
  return res.json({ alert: data });
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

router.get('/bridges', requireAuth, requireOperationsAccess, async (req: Request, res: Response) => {
  try {
    const bridges = await getOperationsBridgeSnapshot();
    if (req.user?.id) void recordOperationsAudit({ actorUserId: req.user.id, action: 'bridges_viewed' });
    return res.json(bridges);
  } catch {
    return res.status(500).json({ error: 'Could not load platform bridge health' });
  }
});

router.get('/users', requireAuth, requireOperationsAccess, requireOperationsOwner, async (req: Request, res: Response) => {
  try {
    const directory = await getOperationsUserDirectory();
    if (req.user?.id) void recordOperationsAudit({ actorUserId: req.user.id, action: 'users_viewed', metadata: { userCount: directory.totals.users } });
    return res.json(directory);
  } catch {
    return res.status(500).json({ error: 'Could not load the user directory' });
  }
});

router.post('/bridges/retire', requireAuth, requireOperationsAccess, requireOperationsOwner, async (req: Request, res: Response) => {
  const accountRef = typeof req.body?.accountRef === 'string' ? req.body.accountRef.trim() : '';
  if (!/^[a-f0-9]{16}$/.test(accountRef)) return res.status(400).json({ error: 'A valid account reference is required' });

  const { data, error } = await supabase
    .from('platform_sessions')
    .select('id,session_id,user_id,platform,status,operations_retired_at')
    .limit(1000);
  if (error) return res.status(500).json({ error: 'Could not inspect platform connections' });

  const target = (data || []).find((row: DbRow) => (
    pseudonymousOperationsRef(`${String(row.user_id)}:${String(row.session_id)}`) === accountRef
  ));
  if (!target) return res.status(404).json({ error: 'That platform connection was not found' });
  if (target.status === 'connected') return res.status(409).json({ error: 'Disconnect the active account from Claire before retiring it from monitoring' });
  if (target.status !== 'disconnected' && target.status !== 'failed') return res.status(409).json({ error: 'Only disconnected or failed connections can be retired from monitoring' });
  if (target.operations_retired_at) return res.json({ retired: true });

  const retiredAt = new Date().toISOString();
  const { data: retiredRows, error: updateError } = await supabase
    .from('platform_sessions')
    .update({ operations_retired_at: retiredAt, operations_retired_by: req.user?.id || null })
    .eq('user_id', target.user_id)
    .eq('platform', target.platform)
    .in('status', ['disconnected', 'failed'])
    .is('operations_retired_at', null)
    .select('id');
  if (updateError) return res.status(500).json({ error: 'Could not retire the platform connection' });

  if (req.user?.id) {
    await recordOperationsAudit({
      actorUserId: req.user.id,
      action: 'bridge_session_retired',
      target: `${String(target.user_id)}:${String(target.session_id)}`,
      metadata: { platform: String(target.platform), retiredCount: retiredRows?.length || 0 },
    });
  }
  await operationsMonitor.runNow();
  return res.json({ retired: true, retiredAt, retiredCount: retiredRows?.length || 0 });
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
