import {
  AuthMethod,
  Platform,
  PlatformCapabilities,
  PlatformSession,
  PlatformStatus,
} from '../types';

export interface PersistedMatrixSessionRow {
  session_id: string;
  user_id: string;
  platform: string;
  status: string;
  platform_user_id?: string | null;
  platform_username?: string | null;
  phone_number?: string | null;
  session_data?: unknown;
  created_at?: string | null;
  last_connected_at?: string | null;
}

const platformValues = new Set<string>(Object.values(Platform));
const statusValues = new Set<string>(Object.values(PlatformStatus));
const authMethodValues = new Set<string>(Object.values(AuthMethod));

/**
 * Serialize only the metadata required to restore a Matrix bridge mapping.
 * In particular, authData may contain a one-time pairing code or cookie flow
 * details and must remain ephemeral in encrypted Redis rather than the app DB.
 */
export function toPersistedMatrixSession(session: PlatformSession) {
  return {
    session_id: session.id,
    user_id: session.userId,
    platform: session.platform,
    status: session.status,
    platform_user_id: session.platformUserId || null,
    platform_username: session.platformUsername || null,
    phone_number: session.phoneNumber || null,
    last_connected_at: session.lastConnectedAt?.toISOString() || null,
    session_data: {
      authMethod: session.authMethod,
      selfGhostId: session.selfGhostId || null,
      selfGhostIds: session.selfGhostIds || [],
      matrixUserId: session.matrixUserId || null,
    },
  };
}

export function fromPersistedMatrixSession(
  row: PersistedMatrixSessionRow,
  capabilities: PlatformCapabilities,
): PlatformSession | null {
  if (!platformValues.has(row.platform) || !statusValues.has(row.status) || !row.session_id || !row.user_id) {
    return null;
  }

  const data = row.session_data && typeof row.session_data === 'object'
    ? row.session_data as Record<string, unknown>
    : {};
  const authMethod = typeof data.authMethod === 'string' && authMethodValues.has(data.authMethod)
    ? data.authMethod as AuthMethod
    : AuthMethod.QR_CODE;
  const selfGhostIds = Array.isArray(data.selfGhostIds)
    ? data.selfGhostIds.filter((value): value is string => typeof value === 'string')
    : [];

  return {
    id: row.session_id,
    userId: row.user_id,
    platform: row.platform as Platform,
    status: row.status as PlatformStatus,
    authMethod,
    platformUserId: row.platform_user_id || undefined,
    platformUsername: row.platform_username || undefined,
    phoneNumber: row.phone_number || undefined,
    selfGhostId: typeof data.selfGhostId === 'string' ? data.selfGhostId : undefined,
    selfGhostIds,
    matrixUserId: typeof data.matrixUserId === 'string' ? data.matrixUserId : undefined,
    createdAt: row.created_at ? new Date(row.created_at) : new Date(),
    lastConnectedAt: row.last_connected_at ? new Date(row.last_connected_at) : undefined,
    capabilities,
  };
}
