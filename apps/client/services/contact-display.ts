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
