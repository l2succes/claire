import { Platform, type UnifiedMessage } from '../adapters/types';

/**
 * WhatsApp can identify a contact with a locally scoped ID (LID) instead of a
 * phone-number JID. A LID is an opaque routing identifier: it is neither a
 * profile name nor a phone number and must never be shown as either.
 */
export function isOpaqueWhatsAppLid(value: string | null | undefined): boolean {
  if (!value) return false;
  const source = value.trim().split('@')[0].toLowerCase();
  return /^lid[-:]?\d+$/.test(source);
}

/** Return a real phone-shaped platform identifier, never a WhatsApp LID. */
export function phoneNumberFromPlatformContactId(
  platform: Platform,
  platformContactId: string | null | undefined
): string | null {
  if (!platformContactId || isOpaqueWhatsAppLid(platformContactId)) return null;
  const source = platformContactId.trim().split('@')[0];
  if (platform === Platform.WHATSAPP && /^\+?\d{7,15}$/.test(source)) return source;
  return null;
}

/**
 * Keep bridge fallbacks out of customer-facing names. The bridge profile name
 * wins whenever it is meaningful; names which merely repeat the Matrix/bridge
 * identifier are deliberately treated as unavailable.
 */
export function displayNameFromBridge(
  candidate: string | null | undefined,
  platform: Platform,
  platformContactId: string | null | undefined
): string | null {
  const name = candidate?.trim() || '';
  if (!name || (platform === Platform.WHATSAPP && isOpaqueWhatsAppLid(name))) return null;
  const contactId = platformContactId?.trim() || '';
  const normalizedName = name.replace(/[^a-z0-9]/gi, '').toLowerCase();
  const normalizedContactId = contactId.replace(/[^a-z0-9]/gi, '').toLowerCase();
  if (normalizedName && normalizedName === normalizedContactId) return null;
  if (platform === Platform.WHATSAPP && /^[+\d().\s-]+$/.test(name)) return null;
  return name;
}

/** Resolve a stable per-platform contact identifier for an incoming message. */
export function incomingContactId(message: Pick<UnifiedMessage, 'platform' | 'isFromMe' | 'senderId'>): string | null {
  if (message.isFromMe || !message.senderId || message.senderId === 'me') return null;

  // A Mac companion reads the Messages DB directly, where senders are plain
  // phone/email handles. Matrix bridge events use ghost MXIDs and take the
  // generic branch below.
  if (message.platform === Platform.IMESSAGE) return message.senderId;

  return message.senderId.match(/@(?:whatsapp|_telegram|meta|_imessage)_([^:]+):/)?.[1] || null;
}
