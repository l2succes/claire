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

/**
 * mautrix uses a privacy-preserving phone mask when WhatsApp has not supplied
 * a profile name. It is useful bridge metadata, but it is neither a person's
 * name nor a phone number Claire can display or search as an identity.
 */
export function isRedactedPhoneFallback(value: string | null | undefined): boolean {
  // Provider masks must never become a persisted display name. The bridge may
  // append arbitrary suffixes, so the mask glyph itself is the reliable signal.
  // mautrix currently uses U+2219 (bullet operator); other providers use
  // U+2022 (bullet) or an asterisk. All are privacy masks.
  return /[•∙*]/.test(value?.trim() || '');
}

/**
 * A bridge can occasionally report punctuation (for example `.`) as a
 * WhatsApp push name. It is not a useful identity and should be treated the
 * same way as an absent profile name. Emoji-only names remain valid: many
 * people intentionally use one as their WhatsApp profile name.
 */
export function isMeaningfulContactName(value: string | null | undefined): boolean {
  return /[\p{L}\p{N}\p{Extended_Pictographic}]/u.test(value?.trim() || '');
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
 * Extract an E.164 phone number from bridge-owned identifiers. mautrix can
 * return a plain number, an E.164 number, or a WhatsApp JID such as
 * `15165551212@s.whatsapp.net`. This is intentionally strict: bridge IDs and
 * LIDs must never be mistaken for phone numbers.
 */
export function phoneNumberFromBridgeIdentifiers(
  identifiers: Array<string | null | undefined>
): string | null {
  for (const identifier of identifiers) {
    if (!identifier) continue;
    const source = identifier
      .trim()
      .replace(/^tel:/i, '')
      .replace(/\s*\(WA\)\s*$/i, '')
      .split('@')[0];
    if (isOpaqueWhatsAppLid(source)) continue;
    const digits = source.replace(/^\+/, '').replace(/[().\s-]/g, '');
    if (/^\d{7,15}$/.test(digits)) return `+${digits}`;
  }
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
  const name = candidate?.trim().replace(/\s*\(WA\)\s*$/i, '') || '';
  if (
    !name ||
    !isMeaningfulContactName(name) ||
    (platform === Platform.WHATSAPP &&
      (isOpaqueWhatsAppLid(name) || isRedactedPhoneFallback(name)))
  ) {
    return null;
  }
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

  return message.senderId.match(GHOST_MXID_PATTERN)?.[1] || null;
}

/**
 * Ghost MXID → platform contact id. Kept in one place so adding a bridge does
 * not require finding every copy of this regex.
 */
const GHOST_MXID_PATTERN = /@(?:whatsapp|_telegram|meta|_imessage|slack)_([^:]+):/;

/**
 * Resolve a ghost MXID to its platform contact id.
 *
 * Same extraction as incomingContactId, minus the message context — used for
 * mention lists, where the MXIDs belong to people other than the sender.
 */
export function ghostToPlatformContactId(mxid: string): string | null {
  if (!mxid) return null;
  return mxid.match(GHOST_MXID_PATTERN)?.[1] || null;
}

/**
 * Resolve a list of mention MXIDs to platform contact ids, dropping any that
 * don't parse (bridge bots, the homeserver's own users) and de-duplicating.
 */
export function resolveMentions(mxids: string[] | undefined): string[] | null {
  if (!mxids?.length) return null;
  const resolved = [...new Set(mxids.map(ghostToPlatformContactId).filter((id): id is string => !!id))];
  return resolved.length ? resolved : null;
}
