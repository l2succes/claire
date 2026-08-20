import { createHmac } from 'crypto';
import { config } from '../config';
import { supabase } from './supabase';
import { logger } from '../utils/logger';
import { pseudonymousOperationsRef } from './operations-privacy';

const PLATFORMS = new Set(['whatsapp', 'telegram', 'instagram', 'imessage', 'mock']);
const STAGES = new Set(['provider', 'bridge', 'matrix', 'api', 'database', 'realtime', 'push', 'client_ack']);
const OUTCOMES = new Set(['accepted', 'persisted', 'published', 'acknowledged', 'failed', 'retrying', 'connected', 'disconnected']);
const ERROR_CLASSES = new Set(['auth', 'network', 'rate_limit', 'validation', 'dependency', 'provider', 'unknown']);

export type OperationsStage = 'provider' | 'bridge' | 'matrix' | 'api' | 'database' | 'realtime' | 'push' | 'client_ack';
export type OperationsOutcome = 'accepted' | 'persisted' | 'published' | 'acknowledged' | 'failed' | 'retrying' | 'connected' | 'disconnected';
export type OperationsDirection = 'inbound' | 'outbound' | 'system';
export type OperationsErrorClass = 'auth' | 'network' | 'rate_limit' | 'validation' | 'dependency' | 'provider' | 'unknown';

export interface OperationalEventInput {
  /** Internal-only correlation material. It is HMACed before persistence. */
  traceSource: string;
  /** Internal user id. It is HMACed before persistence. */
  userId: string;
  platform: string;
  direction: OperationsDirection;
  stage: OperationsStage;
  outcome: OperationsOutcome;
  durationMs?: number;
  retryCount?: number;
  errorClass?: OperationsErrorClass;
  occurredAt?: string;
}

export interface OperationsTelemetryEvent {
  id: string;
  trace_ref: string;
  account_ref: string;
  platform: string;
  direction: OperationsDirection;
  stage: OperationsStage;
  outcome: OperationsOutcome;
  duration_ms: number | null;
  retry_count: number;
  error_class: OperationsErrorClass | null;
  occurred_at: string;
}

function traceRef(source: string): string {
  return createHmac('sha256', config.ENCRYPTION_KEY).update(`ops-trace:${source}`).digest('hex').slice(0, 32);
}

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
}

function bucketStart(iso: string, minutes: number): string {
  const time = new Date(iso).getTime();
  return new Date(Math.floor(time / (minutes * 60_000)) * minutes * 60_000).toISOString();
}

/**
 * A deliberately small observability write path. It is best-effort: monitoring
 * must never stop a customer message from being persisted or delivered.
 */
class OperationsTelemetry {
  async record(input: OperationalEventInput): Promise<void> {
    if (!PLATFORMS.has(input.platform) || !STAGES.has(input.stage) || !OUTCOMES.has(input.outcome)) {
      logger.warn('Rejected invalid Operations telemetry event');
      return;
    }
    if (input.errorClass && !ERROR_CLASSES.has(input.errorClass)) {
      logger.warn('Rejected invalid Operations telemetry error class');
      return;
    }
    const durationMs = typeof input.durationMs === 'number' && Number.isFinite(input.durationMs)
      ? Math.max(0, Math.round(input.durationMs)) : null;
    const retryCount = typeof input.retryCount === 'number' && Number.isFinite(input.retryCount)
      ? Math.min(100, Math.max(0, Math.round(input.retryCount))) : 0;
    const { error } = await supabase.from('operations_telemetry_events').insert({
      trace_ref: traceRef(input.traceSource),
      account_ref: pseudonymousOperationsRef(input.userId),
      platform: input.platform,
      direction: input.direction,
      stage: input.stage,
      outcome: input.outcome,
      duration_ms: durationMs,
      retry_count: retryCount,
      error_class: input.errorClass || null,
      occurred_at: input.occurredAt || new Date().toISOString(),
    });
    if (error) logger.warn('Could not persist Operations telemetry event', { errorCode: error.code || 'telemetry_write_failed' });
  }

  async summary(rangeMinutes: number): Promise<Record<string, unknown>> {
    const safeRange = [15, 60, 360, 1440].includes(rangeMinutes) ? rangeMinutes : 60;
    const from = new Date(Date.now() - safeRange * 60_000).toISOString();
    const { data, error } = await supabase
      .from('operations_telemetry_events')
      .select('id,trace_ref,account_ref,platform,direction,stage,outcome,duration_ms,retry_count,error_class,occurred_at')
      .gte('occurred_at', from)
      .order('occurred_at', { ascending: false })
      .limit(10_000);
    if (error) throw error;
    const events = (data || []) as OperationsTelemetryEvent[];
    const bucketMinutes = safeRange <= 60 ? 5 : safeRange <= 360 ? 15 : 60;
    const series = new Map<string, { at: string; inbound: number; outbound: number; failures: number }>();
    const platforms = new Map<string, { platform: string; inbound: number; outbound: number; failed: number; retries: number; accounts: Set<string>; lastEventAt: string | null }>();
    const stages = new Map<string, { stage: string; total: number; failed: number; p95Ms: number | null; values: number[]; lastEventAt: string | null }>();
    const activeClients = new Set<string>();

    for (const event of events) {
      const bucket = bucketStart(event.occurred_at, bucketMinutes);
      const point = series.get(bucket) || { at: bucket, inbound: 0, outbound: 0, failures: 0 };
      if (event.direction === 'inbound') point.inbound += 1;
      if (event.direction === 'outbound') point.outbound += 1;
      if (event.outcome === 'failed') point.failures += 1;
      series.set(bucket, point);

      const platform = platforms.get(event.platform) || { platform: event.platform, inbound: 0, outbound: 0, failed: 0, retries: 0, accounts: new Set<string>(), lastEventAt: null };
      if (event.direction === 'inbound') platform.inbound += 1;
      if (event.direction === 'outbound') platform.outbound += 1;
      if (event.outcome === 'failed') platform.failed += 1;
      platform.retries += event.retry_count || 0;
      platform.accounts.add(event.account_ref);
      if (!platform.lastEventAt || event.occurred_at > platform.lastEventAt) platform.lastEventAt = event.occurred_at;
      platforms.set(event.platform, platform);

      const stage = stages.get(event.stage) || { stage: event.stage, total: 0, failed: 0, p95Ms: null, values: [], lastEventAt: null };
      stage.total += 1;
      if (event.outcome === 'failed') stage.failed += 1;
      if (typeof event.duration_ms === 'number') stage.values.push(event.duration_ms);
      if (!stage.lastEventAt || event.occurred_at > stage.lastEventAt) stage.lastEventAt = event.occurred_at;
      stages.set(event.stage, stage);
      if (event.stage === 'client_ack' && event.outcome === 'connected' && Date.now() - new Date(event.occurred_at).getTime() < 5 * 60_000) activeClients.add(event.account_ref);
    }

    return {
      rangeMinutes: safeRange,
      generatedAt: new Date().toISOString(),
      totals: { events: events.length, activeAccounts: new Set(events.map((event) => event.account_ref)).size, activeClients: activeClients.size },
      series: [...series.values()].sort((a, b) => a.at.localeCompare(b.at)),
      platforms: [...platforms.values()].map(({ accounts, ...item }) => ({ ...item, activeAccounts: accounts.size })).sort((a, b) => b.inbound + b.outbound - (a.inbound + a.outbound)),
      stages: [...stages.values()].map(({ values, ...item }) => ({ ...item, p95Ms: percentile(values, 0.95) })).sort((a, b) => a.stage.localeCompare(b.stage)),
      journal: events.slice(0, 40).map((event) => ({
        id: event.id, platform: event.platform, direction: event.direction, stage: event.stage, outcome: event.outcome,
        durationMs: event.duration_ms, retryCount: event.retry_count, errorClass: event.error_class, occurredAt: event.occurred_at,
      })),
    };
  }
}

export const operationsTelemetry = new OperationsTelemetry();
