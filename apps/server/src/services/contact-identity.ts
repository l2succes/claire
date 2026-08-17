import { Platform, type UnifiedMessage } from '../adapters/types';

/** Resolve a stable per-platform contact identifier for an incoming message. */
export function incomingContactId(message: Pick<UnifiedMessage, 'platform' | 'isFromMe' | 'senderId'>): string | null {
  if (message.isFromMe || !message.senderId || message.senderId === 'me') return null;

  // A Mac companion reads the Messages DB directly, where senders are plain
  // phone/email handles. Matrix bridge events use ghost MXIDs and take the
  // generic branch below.
  if (message.platform === Platform.IMESSAGE) return message.senderId;

  return message.senderId.match(/@(?:whatsapp|_telegram|meta|_imessage)_([^:]+):/)?.[1] || null;
}
