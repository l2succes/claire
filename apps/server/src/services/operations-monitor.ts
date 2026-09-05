import { matrixConfig, serverConfig } from '../config';
import { pushNotificationService } from './push-notification';
import { redis } from './redis';
import { type DbRow, supabase } from './supabase';
import { logger } from '../utils/logger';
import { classifyBridgeSessions, classifyMessageFreshness } from './operations-health';
import { sanitizeOperationsDetails } from './operations-privacy';

export type OperationsStatus = 'healthy' | 'warning' | 'critical' | 'unknown';

export interface OperationsComponentCheck {
  component: string;
  status: OperationsStatus;
  summary: string;
  details: Record<string, number | string | boolean | null>;
}

export interface OperationsSnapshot {
  observedAt: string;
  checks: OperationsComponentCheck[];
}

const severityFor = (status: OperationsStatus): 'warning' | 'critical' | null =>
  status === 'critical' ? 'critical' : status === 'warning' ? 'warning' : null;

class OperationsMonitor {
  private timer: ReturnType<typeof setInterval> | null = null;
  private snapshot: OperationsSnapshot = { observedAt: new Date(0).toISOString(), checks: [] };

  start(): void {
    if (this.timer) return;
    void this.runNow();
    this.timer = setInterval(() => void this.runNow(), serverConfig.operations.monitorIntervalSeconds * 1_000);
    logger.info(`Operations monitor started (${serverConfig.operations.monitorIntervalSeconds}s interval)`);
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  getSnapshot(): OperationsSnapshot {
    return this.snapshot;
  }

  async runNow(): Promise<OperationsSnapshot> {
    try {
      const checks = await this.collectChecks();
      this.snapshot = { observedAt: new Date().toISOString(), checks };
      await this.persistAndAlert(checks);
      return this.snapshot;
    } catch (error) {
      logger.error('Operations monitor run failed', error);
      this.snapshot = {
        observedAt: new Date().toISOString(),
        checks: [{ component: 'operations_monitor', status: 'critical', summary: 'Monitor run failed', details: {} }],
      };
      return this.snapshot;
    }
  }

  private async collectChecks(): Promise<OperationsComponentCheck[]> {
    const [database, cache, matrix, bridge, messageFlow, notifications] = await Promise.all([
      this.checkDatabase(), this.checkRedis(), this.checkMatrix(), this.checkBridgeSessions(), this.checkMessageFlow(), this.checkNotifications(),
    ]);
    return [database, cache, matrix, bridge, ...messageFlow, notifications];
  }

  private async checkDatabase(): Promise<OperationsComponentCheck> {
    const started = Date.now();
    const { error } = await supabase.from('messages').select('id', { head: true, count: 'exact' }).limit(1);
    return error
      ? { component: 'postgres', status: 'critical', summary: 'Message database query failed', details: { error: error.code || 'query_failed' } }
      : { component: 'postgres', status: 'healthy', summary: 'Message database is queryable', details: { latencyMs: Date.now() - started } };
  }

  private async checkRedis(): Promise<OperationsComponentCheck> {
    const started = Date.now();
    const ok = await redis.ping();
    return ok
      ? { component: 'redis', status: 'healthy', summary: 'Redis responded to ping', details: { latencyMs: Date.now() - started } }
      : { component: 'redis', status: 'critical', summary: 'Redis did not respond to ping', details: {} };
  }

  private async checkMatrix(): Promise<OperationsComponentCheck> {
    if (!matrixConfig.enabled || !matrixConfig.homeserverUrl) {
      return { component: 'matrix', status: 'unknown', summary: 'Matrix mode is not enabled', details: {} };
    }
    const started = Date.now();
    try {
      const response = await fetch(`${matrixConfig.homeserverUrl}/_matrix/client/versions`, { signal: AbortSignal.timeout(3_000) });
      return response.ok
        ? { component: 'matrix', status: 'healthy', summary: 'Synapse versions endpoint responded', details: { latencyMs: Date.now() - started } }
        : { component: 'matrix', status: 'critical', summary: `Synapse returned HTTP ${response.status}`, details: { httpStatus: response.status } };
    } catch {
      return { component: 'matrix', status: 'critical', summary: 'Synapse versions endpoint is unreachable', details: {} };
    }
  }

  private async checkBridgeSessions(): Promise<OperationsComponentCheck> {
    const { data, error } = await supabase.from('platform_sessions').select('platform,status');
    if (error) return { component: 'bridge_sessions', status: 'critical', summary: 'Could not read durable bridge sessions', details: { error: error.code || 'query_failed' } };
    const connected = (data || []).filter((row: DbRow) => row.status === 'connected').length;
    const disconnected = (data || []).filter((row: DbRow) => row.status === 'disconnected' || row.status === 'failed').length;
    return { component: 'bridge_sessions', ...classifyBridgeSessions(connected, disconnected), details: { connected, disconnected } };
  }

  private async checkMessageFlow(): Promise<OperationsComponentCheck[]> {
    const freshnessMinutes = serverConfig.operations.messageFreshnessMinutes;
    const from = new Date(Date.now() - freshnessMinutes * 2 * 60_000).toISOString();
    const split = Date.now() - freshnessMinutes * 60_000;
    const [{ data: sessions, error: sessionError }, { data: messages, error: messageError }] = await Promise.all([
      supabase.from('platform_sessions').select('platform').eq('status', 'connected'),
      supabase.from('messages').select('platform,created_at').gte('created_at', from),
    ]);
    if (sessionError || messageError) {
      return [{ component: 'message_flow', status: 'critical', summary: 'Could not measure message freshness', details: { error: sessionError?.code || messageError?.code || 'query_failed' } }];
    }
    const platforms = [...new Set((sessions || []).map((row: DbRow) => String(row.platform)))];
    return platforms.map((platform) => {
      const rows = (messages || []).filter((row: DbRow) => row.platform === platform);
      const recentCount = rows.filter((row: DbRow) => new Date(row.created_at).getTime() >= split).length;
      const previousCount = rows.length - recentCount;
      const result = classifyMessageFreshness(recentCount, previousCount, freshnessMinutes);
      return { component: `message_flow:${platform}`, ...result, details: { recentCount, previousCount, freshnessMinutes } };
    });
  }

  private async checkNotifications(): Promise<OperationsComponentCheck> {
    const from = new Date(Date.now() - 15 * 60_000).toISOString();
    const { data, error } = await supabase.from('notification_deliveries').select('state').gte('updated_at', from);
    if (error) return { component: 'notifications', status: 'unknown', summary: 'Notification delivery telemetry is unavailable', details: { error: error.code || 'query_failed' } };
    const failed = (data || []).filter((row: DbRow) => row.state === 'failed').length;
    const delivered = (data || []).filter((row: DbRow) => row.state === 'delivered' || row.state === 'submitted').length;
    return failed > 0
      ? { component: 'notifications', status: 'warning', summary: `${failed} notification delivery failure(s) in the last 15 minutes`, details: { failed, delivered } }
      : { component: 'notifications', status: 'healthy', summary: 'No recent notification delivery failures', details: { failed, delivered } };
  }

  private async persistAndAlert(checks: OperationsComponentCheck[]): Promise<void> {
    for (const check of checks) {
      const observedAt = new Date().toISOString();
      const { error } = await supabase.from('operations_component_checks').upsert({
        component: check.component, status: check.status, summary: check.summary.slice(0, 240), details: sanitizeOperationsDetails(check.details), observed_at: observedAt, updated_at: observedAt,
      }, { onConflict: 'component' });
      if (error) throw error;
      await this.reconcileIncident(check);
    }
  }

  private async reconcileIncident(check: OperationsComponentCheck): Promise<void> {
    const severity = severityFor(check.status);
    const fingerprint = `operations:${check.component}`;
    const now = new Date().toISOString();
    const { data: existing } = await supabase.from('operations_incidents').select('id,status,last_alerted_at').eq('fingerprint', fingerprint).maybeSingle();
    if (!severity) {
      if (existing?.status === 'open') await supabase.from('operations_incidents').update({ status: 'resolved', resolved_at: now, updated_at: now }).eq('id', existing.id);
      return;
    }
    const isNew = !existing || existing.status !== 'open';
    const { data: incident, error } = await supabase.from('operations_incidents').upsert({
      fingerprint, component: check.component, severity, title: check.summary.slice(0, 240), details: sanitizeOperationsDetails(check.details), status: 'open',
      ...(isNew ? { first_detected_at: now, resolved_at: null } : {}), last_detected_at: now, updated_at: now,
    }, { onConflict: 'fingerprint' }).select('id,last_alerted_at').single();
    if (error || !incident) throw error || new Error('Could not persist operational incident');
    const lastAlerted = incident.last_alerted_at ? new Date(incident.last_alerted_at).getTime() : 0;
    if (isNew || Date.now() - lastAlerted > 30 * 60_000) {
      await this.sendAlert(severity, check.summary);
      await supabase.from('operations_incidents').update({ last_alerted_at: now, updated_at: now }).eq('id', incident.id);
    }
  }

  private async sendAlert(severity: 'warning' | 'critical', summary: string): Promise<void> {
    if (serverConfig.operations.alertUserIds.length === 0) {
      logger.warn('Operations incident opened but OPS_ALERT_USER_IDS is not configured');
      return;
    }
    for (const userId of serverConfig.operations.alertUserIds) {
      const { data } = await supabase.from('notification_devices').select('token').eq('user_id', userId).eq('enabled', true).eq('provider', 'expo');
      await pushNotificationService.sendToTokens((data || []).map((row: DbRow) => row.token), {
        title: severity === 'critical' ? 'Claire needs attention' : 'Claire health warning',
        body: summary,
        data: { type: 'operations_incident', version: 1 },
        sound: 'default',
      });
    }
  }
}

export const operationsMonitor = new OperationsMonitor();
