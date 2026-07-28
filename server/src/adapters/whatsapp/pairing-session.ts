import { PlatformSession, PlatformStatus } from '../types';

const PENDING_PAIRING_STATUSES = new Set<PlatformStatus>([
  PlatformStatus.INITIALIZING,
  PlatformStatus.AWAITING_AUTH,
  PlatformStatus.AUTHENTICATING,
]);

export function getPendingPairingSessions(
  sessions: PlatformSession[]
): PlatformSession[] {
  return sessions.filter((session) => PENDING_PAIRING_STATUSES.has(session.status));
}

export function selectReusablePairingSession(
  sessions: PlatformSession[],
  liveSessionIds: ReadonlySet<string>
): PlatformSession | undefined {
  const livePendingSessions = getPendingPairingSessions(sessions)
    .filter((session) => liveSessionIds.has(session.id));

  return livePendingSessions.find((session) => session.authData?.pairingCode)
    ?? livePendingSessions[0];
}
