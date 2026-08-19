import { platformCatalog, type PlatformDefinition } from '../platform-catalog';
import { pseudonymousOperationsRef } from './operations-privacy';
import { type DbRow, supabase } from './supabase';

type BridgeSessionState = 'connected' | 'setup' | 'attention';

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

/**
 * Metadata-only bridge inventory for Operations. Never select provider handles,
 * phone numbers, session payloads, credentials, or user identity fields here.
 */
export async function getOperationsBridgeSnapshot(): Promise<{
  generatedAt: string;
  platforms: OperationsBridgePlatform[];
  sessions: OperationsBridgeSession[];
}> {
  const { data, error } = await supabase
    .from('platform_sessions')
    .select('session_id,user_id,platform,status,last_connected_at,updated_at')
    .limit(1000);
  if (error) throw error;

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

  const platforms = platformCatalog.map((definition): OperationsBridgePlatform => {
    const platformSessions = sessions.filter((session) => session.platform === definition.id);
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
    };
  });

  return { generatedAt: new Date().toISOString(), platforms, sessions };
}
