import { Platform } from '../types/platform';
import {
  formatPhoneNumber,
  isOpaqueWhatsAppLid,
  isPhoneNumberFallback,
  isRedactedPhoneFallback,
} from './phone-numbers';

/**
 * Bridges occasionally emit a single punctuation mark as a profile display
 * name. It is a placeholder, not something a person chose that helps the
 * user identify a conversation. Emoji-only names remain valid: people do
 * genuinely use them as WhatsApp profile names.
 */
function isMeaningfulName(value: string): boolean {
  return /[\p{L}\p{N}\p{Extended_Pictographic}]/u.test(value);
}

function isUsableWhatsAppName(value: string): boolean {
  return (
    isMeaningfulName(value) &&
    !isOpaqueWhatsAppLid(value) &&
    !isRedactedPhoneFallback(value) &&
    !isPhoneNumberFallback(value)
  );
}

function isWhatsAppPlatform(platform: Platform | string | null | undefined): boolean {
  return String(platform || '').toLowerCase() === Platform.WHATSAPP;
}

/**
 * Customer-facing contact label. Matrix/WhatsApp LIDs are intentionally
 * hidden: they are opaque bridge routing IDs, not names.
 */
export function displayContactName(
  value: string | null | undefined,
  platform: Platform | string | null | undefined,
  phone?: string | null,
  fallback = 'Conversation'
): string {
  const name = value?.trim() || '';
  const isWhatsApp = isWhatsAppPlatform(platform);
  if (
    name &&
    (!isWhatsApp || isUsableWhatsAppName(name))
  ) {
    return name;
  }
  return formatPhoneNumber(phone) || (isWhatsApp ? 'WhatsApp contact' : fallback);
}

/**
 * Primary People label. When the platform gives us both a profile name and a
 * phone number, people scan much more naturally as "Name" then "Number" than
 * as a phone directory. A phone remains the primary label only when it is the
 * only safe identity we have. This keeps bridge routing IDs and privacy masks
 * out of the product while still making every row useful.
 */
export function displayPersonName(
  contact: {
    name?: string | null;
    inferred_name?: string | null;
    username?: string | null;
    phone_number?: string | null;
    platform?: Platform | string | null;
  },
  fallback = 'Contact'
): string {
  const name = contact.name?.trim() || contact.inferred_name?.trim() || '';
  const username = contact.username?.trim().replace(/^@+/, '') || '';
  const isWhatsApp = isWhatsAppPlatform(contact.platform);
  const visibleName =
    name &&
    (!isWhatsApp || isUsableWhatsAppName(name))
      ? name
      : '';
  const phone = formatPhoneNumber(contact.phone_number);
  return visibleName || (username ? `@${username}` : '') || phone ||
    (isWhatsApp
      ? 'WhatsApp contact'
      : fallback);
}

/**
 * True when a People row gives the user no way to recognise or reach anyone.
 *
 * WhatsApp's bridge produces contacts that are pure residue: a profile name of
 * a single character, no number, no username, and no conversation. They sort
 * into the A–Z index like real people and lead nowhere when tapped.
 *
 * The test is deliberately conservative — every one of these has to be true
 * before a row is hidden — because a false positive silently removes somebody
 * the user was looking for. In particular a row that opens a real conversation
 * is always kept, however useless its name: the chat is somewhere to go.
 */
export function isDeadEndContact(contact: {
  name?: string | null;
  inferred_name?: string | null;
  username?: string | null;
  phone_number?: string | null;
  platform?: Platform | string | null;
  is_group?: boolean | null;
  chat?: { id?: string | null } | null;
}): boolean {
  // A group is identified by being a group; it is never this kind of residue.
  if (contact.is_group) return false;
  if (contact.chat?.id) return false;
  if (formatPhoneNumber(contact.phone_number)) return false;
  if (contact.username?.trim().replace(/^@+/, '')) return false;

  // Both names, not just the one that would be displayed. `name` takes
  // precedence for display, so a contact called "A" whose inferred_name is
  // "Ada Lovelace" would otherwise be judged on the "A" alone and hidden --
  // even though Claire knows exactly who they are.
  const usable = (value: string | null | undefined): boolean => {
    const trimmed = value?.trim() || '';
    if (!trimmed) return false;
    if (isWhatsAppPlatform(contact.platform) && !isUsableWhatsAppName(trimmed)) return false;
    // Counted in code points, so a single emoji counts as one character. A
    // grapheme cluster built from several (a ZWJ sequence, say) counts as more
    // and is kept — erring toward showing the row.
    return [...trimmed].length > 1;
  };

  return !usable(contact.name) && !usable(contact.inferred_name);
}

/** Secondary People identity detail, without duplicating its primary label. */
export function displayPersonDetails(contact: {
  name?: string | null;
  inferred_name?: string | null;
  username?: string | null;
  phone_number?: string | null;
  platform?: Platform | string | null;
}): string | null {
  const name = contact.name?.trim() || contact.inferred_name?.trim() || '';
  const username = contact.username?.trim().replace(/^@+/, '') || '';
  const phone = formatPhoneNumber(contact.phone_number);
  const visibleName = name && (!isWhatsAppPlatform(contact.platform) || isUsableWhatsAppName(name)) ? name : '';
  // A full name belongs on the first line. Put its formatted phone beneath it;
  // otherwise use a public username as the supporting identity.
  if ((visibleName || username) && phone) return phone;
  if (visibleName && username) return `@${username}`;
  if (visibleName) return null;
  return username ? `@${username}` : null;
}
