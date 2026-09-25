export type OperationsBridgeSessionRow = {
  session_id: string;
  user_id: string;
  platform: string;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
  last_connected_at: string | null;
  operations_retired_at: string | null;
};

export type OperationsBridgeLifecycleState =
  | 'connected'
  | 'setup'
  | 'attention'
  | 'superseded'
  | 'retired';

export type ClassifiedOperationsBridgeSession = OperationsBridgeSessionRow & {
  lifecycleState: OperationsBridgeLifecycleState;
  isCurrent: boolean;
};

const CONNECTED_STATUS = 'connected';
const ATTENTION_STATUSES = new Set(['disconnected', 'failed']);

function timestampFor(row: OperationsBridgeSessionRow): number {
  const candidates = [row.updated_at, row.last_connected_at, row.created_at]
    .flatMap((value) => value ? [new Date(value).getTime()] : [])
    .filter(Number.isFinite);
  return candidates.length ? Math.max(...candidates) : 0;
}

function priorityFor(row: OperationsBridgeSessionRow): number {
  if (row.status === CONNECTED_STATUS) return 3;
  if (ATTENTION_STATUSES.has(row.status || '')) return 1;
  return 2;
}

function activeStateFor(status: string | null): OperationsBridgeLifecycleState {
  if (status === CONNECTED_STATUS) return 'connected';
  if (ATTENTION_STATUSES.has(status || '')) return 'attention';
  return 'setup';
}

/**
 * Claire supports one expected connection per user and platform. Older rows are
 * historical attempts, not additional outages. Keep them visible for diagnosis
 * while excluding them from the actionable health count.
 */
export function classifyOperationsBridgeSessions(
  rows: OperationsBridgeSessionRow[],
): ClassifiedOperationsBridgeSession[] {
  const currentSessionIds = new Set<string>();
  const groups = new Map<string, OperationsBridgeSessionRow[]>();

  for (const row of rows) {
    if (row.operations_retired_at) continue;
    const key = `${row.user_id}:${row.platform}`;
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    const [current] = [...group].sort((left, right) => {
      const priority = priorityFor(right) - priorityFor(left);
      return priority || timestampFor(right) - timestampFor(left);
    });
    if (current) currentSessionIds.add(current.session_id);
  }

  return rows.map((row) => {
    const isCurrent = !row.operations_retired_at && currentSessionIds.has(row.session_id);
    const lifecycleState: OperationsBridgeLifecycleState = row.operations_retired_at
      ? 'retired'
      : isCurrent ? activeStateFor(row.status) : 'superseded';
    return { ...row, lifecycleState, isCurrent };
  });
}

