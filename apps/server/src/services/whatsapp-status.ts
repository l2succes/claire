import { Platform } from '../adapters/types';

interface WhatsAppStatusCandidate {
  platform: string;
  chatId: string;
  chatName?: string;
  platformMetadata?: Record<string, unknown>;
}

const STATUS_ROOM_NAMES = new Set([
  'whatsapp status broadcast',
  'whatsapp status updates',
  'status updates',
]);

/**
 * WhatsApp Status is exposed by bridges as a pseudo-conversation. Depending on
 * the bridge and sync path, the stable signal may be message metadata, the
 * broadcast JID, or only the Matrix room name.
 */
export function isWhatsAppStatusUpdate(message: WhatsAppStatusCandidate): boolean {
  if (message.platform !== Platform.WHATSAPP) return false;
  if (message.platformMetadata?.isStatus === true) return true;

  const chatId = message.chatId.trim().toLowerCase();
  if (/(^|[:/])status@broadcast(?:$|[:/?#])/.test(chatId)) return true;

  const chatName = message.chatName?.trim().replace(/\s+/g, ' ').toLowerCase();
  return chatName ? STATUS_ROOM_NAMES.has(chatName) : false;
}
