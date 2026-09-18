import {
  classifyOperationsBridgeSessions,
  type OperationsBridgeLifecycleState,
  type OperationsBridgeSessionRow,
} from './operations-bridge-sessions';

export type OperationsUserPlatform = {
  platform: string;
  state: Exclude<OperationsBridgeLifecycleState, 'superseded'>;
  lastConnectedAt: string | null;
  statusChangedAt: string | null;
};

export type OperationsUser = {
  accountRef: string;
  email: string;
  signedUpAt: string | null;
  isDemo: boolean;
  lastConnectionUpdateAt: string | null;
  platforms: OperationsUserPlatform[];
};

export type OperationsUserRow = {
  id: string;
  email: string;
  created_at: string | null;
  is_demo?: boolean | null;
};

function timestamp(value: string | null): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function latest(values: Array<string | null>): string | null {
  const sorted = values.filter((value): value is string => Boolean(value)).sort();
  return sorted.at(-1) || null;
}

/**
 * Join account identity to connection metadata without reading chats, messages,
 * contacts, provider handles, phone numbers, or credentials.
 */
export function buildOperationsUserDirectory(
  userRows: OperationsUserRow[],
  sessionRows: OperationsBridgeSessionRow[],
  accountRefFor: (userId: string) => string,
): OperationsUser[] {
  const classified = classifyOperationsBridgeSessions(sessionRows);
  const sessionsByUser = new Map<string, typeof classified>();

  for (const session of classified) {
    const sessions = sessionsByUser.get(session.user_id) || [];
    sessions.push(session);
    sessionsByUser.set(session.user_id, sessions);
  }

  return userRows
    .map((user): OperationsUser => {
      const userSessions = sessionsByUser.get(user.id) || [];
      const platforms = [...new Set(userSessions.map((session) => session.platform))]
        .map((platform): OperationsUserPlatform | null => {
          const platformSessions = userSessions.filter((session) => session.platform === platform);
          const current = platformSessions.find((session) => session.isCurrent);
          const representative = current || [...platformSessions].sort((left, right) => (
            timestamp(right.operations_retired_at || right.updated_at || right.created_at)
            - timestamp(left.operations_retired_at || left.updated_at || left.created_at)
          ))[0];
          if (!representative) return null;
          const state = representative.lifecycleState === 'superseded' ? 'retired' : representative.lifecycleState;
          return {
            platform,
            state,
            lastConnectedAt: representative.last_connected_at,
            statusChangedAt: representative.updated_at,
          };
        })
        .filter((platform): platform is OperationsUserPlatform => platform !== null)
        .sort((left, right) => left.platform.localeCompare(right.platform));

      return {
        accountRef: accountRefFor(user.id),
        email: user.email,
        signedUpAt: user.created_at,
        isDemo: Boolean(user.is_demo),
        lastConnectionUpdateAt: latest(platforms.map((platform) => platform.statusChangedAt)),
        platforms,
      };
    })
    .sort((left, right) => timestamp(right.signedUpAt) - timestamp(left.signedUpAt));
}
