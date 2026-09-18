import { createHash } from 'node:crypto';
import { ClientFacingError } from '../utils/api-error';

/** A stable Matrix transaction survives HTTP retries and server restarts. */
export function outgoingTransactionId(userId: string, platform: string, chatId: string, kind: string, value: unknown) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value || value.length > 512) {
    throw new ClientFacingError('Invalid outgoing request ID');
  }
  return `claire-${createHash('sha256').update(JSON.stringify([userId, platform, chatId, kind, value])).digest('hex')}`;
}
