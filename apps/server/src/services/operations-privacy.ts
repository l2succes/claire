import { createHmac } from 'crypto';
import { config } from '../config';
import { redactForOperations } from '../utils/redaction';

const SAFE_DETAIL_KEYS = new Set([
  'latencyMs', 'httpStatus', 'connected', 'disconnected', 'recentCount', 'previousCount',
  'freshnessMinutes', 'failed', 'delivered', 'error', 'retries', 'queueDepth', 'activeClients',
]);

/** The Operations Console is intentionally unable to become a chat viewer. */
export function sanitizeOperationsDetails(details: Record<string, unknown>): Record<string, number | string | boolean | null> {
  const result: Record<string, number | string | boolean | null> = {};
  for (const [key, value] of Object.entries(details)) {
    if (!SAFE_DETAIL_KEYS.has(key)) continue;
    if (value === null || typeof value === 'boolean' || typeof value === 'number') {
      result[key] = value;
    } else if (typeof value === 'string') {
      const safe = redactForOperations(value, key, false);
      if (typeof safe === 'string') result[key] = safe.slice(0, 120);
    }
  }
  return result;
}

export function pseudonymousOperationsRef(value: string): string {
  return createHmac('sha256', config.ENCRYPTION_KEY).update(value).digest('hex').slice(0, 16);
}
