import { platformCatalog, type PlatformDefinition } from '../platform-catalog';
import { pseudonymousOperationsRef } from './operations-privacy';
import { type DbRow, supabase } from './supabase';
import {
  classifyOperationsBridgeSessions,
  type OperationsBridgeLifecycleState,
  type OperationsBridgeSessionRow,
} from './operations-bridge-sessions';

export type OperationsBridgeActivityEvent = {
  id: string;
  direction: 'inbound' | 'outbound' | 'system';
  stage: 'bridge' | 'matrix';
  outcome: 'accepted' | 'failed' | 'retrying' | 'connected' | 'disconnected';
  durationMs: number | null;
  retryCount: number;
  errorClass: string | null;
  occurredAt: string;
};

type OperationsBridgeActivity = {
  total: number;
  failed: number;
  retrying: number;
  p95Ms: number | null;
  lastEventAt: string | null;
  events: OperationsBridgeActivityEvent[];
};

export type OperationsBridgeSession = {
  accountRef: string;
  platform: string;
  state: OperationsBridgeLifecycleState;
  reason: string;
  recovery: string;
  lastConnectedAt: string | null;
  statusChangedAt: string | null;
  isCurrent: boolean;
  canRetire: boolean;
};

export type OperationsBridgePlatform = Pick<
  PlatformDefinition,
  'id' | 'name' | 'mark' | 'bridge' | 'supportStatus' | 'setupLabel' | 'runtimeLabel' | 'detail'
> & {
  flow: string[];
  connected: number;
  setup: number;
  attention: number;
  ignored: number;
  latestSessionUpdateAt: string | null;
  activity: OperationsBridgeActivity;
};

function recoveryFor(state: OperationsBridgeLifecycleState): string {
  if (state === 'connected') return 'Bridge is connected and eligible to receive events.';
  if (state === 'attention') return 'Reconnect in Claire → Settings → Connections, or retire it here if this account is no longer expected.';
  if (state === 'superseded') return 'No action needed. A newer connection for this platform replaced this historical session.';
  if (state === 'retired') return 'No action needed. An Operations owner retired this historical session from monitoring.';
  return 'Connection setup is still in progress; complete the platform authorization flow.';
}

function reasonFor(state: OperationsBridgeLifecycleState): string {
  if (state === 'connected') return 'This is the current connection for the platform.';
  if (state === 'attention') return 'This is the current expected connection, but it is disconnected or failed.';
  if (state === 'superseded') return 'A newer connection exists, so this row does not affect service health.';
  if (state === 'retired') return 'This row was intentionally removed from service-health monitoring.';
  return 'This is the current connection attempt and setup has not completed.';
}

function latest(values: Array<string | null>): string | null {
  const timestamps = values.filter((value): value is string => Boolean(value)).sort();
  return timestamps.at(-1) || null;
}

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
}

function emptyActivity(): OperationsBridgeActivity {
  return { total: 0, failed: 0, retrying: 0, p95Ms: null, lastEventAt: null, events: [] };
}

/**
 * Metadata-only bridge inventory for Operations. Never select provider handles,
 * phone numbers, session payloads, credentials, or user identity fields here.
 */
export async function getOperationsBridgeSnapshot(): Promise<{
  generatedAt: string;
  platforms: OperationsBridgePlatform[];
  sessions: OperationsBridgeSession[];
}> {
  const activityFrom = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const [{ data, error }, { data: activityData, error: activityError }] = await Promise.all([
    supabase.from('platform_sessions').select('session_id,user_id,platform,status,created_at,last_connected_at,updated_at,operations_retired_at').limit(1000),
    supabase.from('operations_telemetry_events')
      .select('id,platform,direction,stage,outcome,duration_ms,retry_count,error_class,occurred_at')
      .in('stage', ['bridge', 'matrix'])
      .gte('occurred_at', activityFrom)
      .order('occurred_at', { ascending: false })
      .limit(500),
  ]);
  if (error || activityError) throw error || activityError;

  const sessionRows: OperationsBridgeSessionRow[] = (data || []).map((row: DbRow) => ({
    session_id: String(row.session_id),
    user_id: String(row.user_id),
    platform: String(row.platform),
    status: typeof row.status === 'string' ? row.status : null,
    created_at: typeof row.created_at === 'string' ? row.created_at : null,
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : null,
    last_connected_at: typeof row.last_connected_at === 'string' ? row.last_connected_at : null,
    operations_retired_at: typeof row.operations_retired_at === 'string' ? row.operations_retired_at : null,
  }));

  const sessions: OperationsBridgeSession[] = classifyOperationsBridgeSessions(sessionRows).map((row): OperationsBridgeSession => {
    const state = row.lifecycleState;
    return {
      accountRef: pseudonymousOperationsRef(`${row.user_id}:${row.session_id}`),
      platform: row.platform,
      state,
      reason: reasonFor(state),
      recovery: recoveryFor(state),
      lastConnectedAt: row.last_connected_at,
      statusChangedAt: row.updated_at,
      isCurrent: row.isCurrent,
      canRetire: state === 'attention',
    };
  });

  const eventsByPlatform = new Map<string, OperationsBridgeActivityEvent[]>();
  for (const row of activityData || []) {
    const platform = String((row as DbRow).platform);
    const event: OperationsBridgeActivityEvent = {
      id: String((row as DbRow).id),
      direction: String((row as DbRow).direction) as OperationsBridgeActivityEvent['direction'],
      stage: String((row as DbRow).stage) as OperationsBridgeActivityEvent['stage'],
      outcome: String((row as DbRow).outcome) as OperationsBridgeActivityEvent['outcome'],
      durationMs: typeof (row as DbRow).duration_ms === 'number' ? (row as DbRow).duration_ms as number : null,
      retryCount: typeof (row as DbRow).retry_count === 'number' ? (row as DbRow).retry_count as number : 0,
      errorClass: typeof (row as DbRow).error_class === 'string' ? (row as DbRow).error_class as string : null,
      occurredAt: String((row as DbRow).occurred_at),
    };
    const events = eventsByPlatform.get(platform) || [];
    if (events.length < 30) events.push(event);
    eventsByPlatform.set(platform, events);
  }

  const platforms = platformCatalog.map((definition): OperationsBridgePlatform => {
    const platformSessions = sessions.filter((session) => session.platform === definition.id);
    const events = eventsByPlatform.get(definition.id) || [];
    const activity = events.length
      ? {
        total: events.length,
        failed: events.filter((event) => event.outcome === 'failed').length,
        retrying: events.filter((event) => event.outcome === 'retrying').length,
        p95Ms: percentile(events.flatMap((event) => event.durationMs === null ? [] : [event.durationMs]), 0.95),
        lastEventAt: events[0]?.occurredAt || null,
        events,
      }
      : emptyActivity();
    return {
      id: definition.id,
      name: definition.name,
      mark: definition.mark,
      bridge: definition.bridge,
      supportStatus: definition.supportStatus,
      setupLabel: definition.setupLabel,
      runtimeLabel: definition.runtimeLabel,
      detail: definition.detail,
      flow: [definition.name, definition.bridge, 'Synapse', 'Claire API', 'Postgres', 'Realtime clients'],
      connected: platformSessions.filter((session) => session.state === 'connected').length,
      setup: platformSessions.filter((session) => session.state === 'setup').length,
      attention: platformSessions.filter((session) => session.state === 'attention').length,
      ignored: platformSessions.filter((session) => session.state === 'superseded' || session.state === 'retired').length,
      latestSessionUpdateAt: latest(platformSessions.map((session) => session.statusChangedAt)),
      activity,
    };
  });

  return { generatedAt: new Date().toISOString(), platforms, sessions };
}
