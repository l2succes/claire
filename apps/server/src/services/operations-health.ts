type OperationsStatus = 'healthy' | 'warning' | 'critical' | 'unknown';

/**
 * A platform may naturally be quiet. Treat it as an incident only when traffic
 * existed in the preceding comparison window but stopped in the current one.
 */
export function classifyMessageFreshness(
  recentCount: number,
  previousCount: number,
  freshnessMinutes: number,
): { status: OperationsStatus; summary: string } {
  if (recentCount > 0) {
    return { status: 'healthy', summary: `${recentCount} messages ingested in the last ${freshnessMinutes} minutes` };
  }
  if (previousCount > 0) {
    return { status: 'critical', summary: `Message ingestion stopped after ${previousCount} messages in the preceding window` };
  }
  return { status: 'unknown', summary: 'No recent traffic baseline; freshness cannot be inferred' };
}

export function classifyBridgeSessions(
  connected: number,
  disconnected: number,
): { status: OperationsStatus; summary: string } {
  if (connected === 0 && disconnected > 0) {
    return { status: 'critical', summary: 'No durable bridge sessions are connected' };
  }
  if (disconnected > 0) {
    return {
      status: 'warning',
      summary: `${connected} durable bridge session(s) connected; ${disconnected} require attention`,
    };
  }
  if (connected > 0) {
    return { status: 'healthy', summary: `${connected} durable bridge session(s) connected` };
  }
  return { status: 'unknown', summary: 'No messaging accounts are connected' };
}
