import { platformCatalog, type PlatformDefinition } from '../platform-catalog';
import { pseudonymousOperationsRef } from './operations-privacy';
import { type DbRow, supabase } from './supabase';

type BridgeSessionState = 'connected' | 'setup' | 'attention';

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
  state: BridgeSessionState;
  recovery: string;
  lastActivityAt: string | null;
};

export type OperationsBridgePlatform = Pick<
  PlatformDefinition,
  'id' | 'name' | 'mark' | 'bridge' | 'supportStatus' | 'setupLabel' | 'runtimeLabel' | 'detail'
> & {
  flow: string[];
  connected: number;
  setup: number;
  attention: number;
  lastActivityAt: string | null;
  activity: OperationsBridgeActivity;
};

function stateFor(status: string): BridgeSessionState {
  return status === 'connected' ? 'connected' : status === 'disconnected' || status === 'failed' ? 'attention' : 'setup';
}

function recoveryFor(state: BridgeSessionState): string {
  if (state === 'connected') return 'Bridge is connected and eligible to receive events.';
  if (state === 'attention') return 'Reconnect or re-authorize this account from its owner’s Claire connection settings.';
  return 'Connection setup is still in progress; complete the platform authorization flow.';
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
    supabase.from('platform_sessions').select('session_id,user_id,platform,status,last_connected_at,updated_at').limit(1000),
    supabase.from('operations_telemetry_events')
      .select('id,platform,direction,stage,outcome,duration_ms,retry_count,error_class,occurred_at')
      .in('stage', ['bridge', 'matrix'])
      .gte('occurred_at', activityFrom)
      .order('occurred_at', { ascending: false })
      .limit(500),
  ]);
  if (error || activityError) throw error || activityError;

  const sessions: OperationsBridgeSession[] = (data || []).map((row: DbRow): OperationsBridgeSession => {
    const state = stateFor(String(row.status || 'initializing'));
    return {
      accountRef: pseudonymousOperationsRef(`${String(row.user_id)}:${String(row.session_id)}`),
      platform: String(row.platform),
      state,
      recovery: recoveryFor(state),
      lastActivityAt: typeof row.last_connected_at === 'string'
        ? row.last_connected_at
        : typeof row.updated_at === 'string' ? row.updated_at : null,
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
      lastActivityAt: latest(platformSessions.map((session) => session.lastActivityAt)),
      activity,
    };
  });

  return { generatedAt: new Date().toISOString(), platforms, sessions };
}
