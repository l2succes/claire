import { Platform } from '../types/platform';
import { formatPhoneNumber, isOpaqueWhatsAppLid } from './phone-numbers';

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
  const isWhatsApp = platform === Platform.WHATSAPP || platform === 'whatsapp';
  if (name && (!isWhatsApp || !isOpaqueWhatsAppLid(name))) return name;
  return formatPhoneNumber(phone) || (isWhatsApp ? 'WhatsApp contact' : fallback);
}

/**
 * Full contact identity used by People. Provider profile names are preferred,
 * followed by a public username, then a formatted phone number. This keeps
 * bridge routing IDs out of the product while still making every row useful.
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
  const isWhatsApp = contact.platform === Platform.WHATSAPP || contact.platform === 'whatsapp';
  const visibleName = name && (!isWhatsApp || !isOpaqueWhatsAppLid(name)) ? name : '';
  return visibleName || (username ? `@${username}` : '') ||
    formatPhoneNumber(contact.phone_number) ||
    (isWhatsApp
      ? 'WhatsApp contact'
      : fallback);
}

/** Secondary identity detail for a People row, without duplicating its title. */
export function displayPersonDetails(contact: {
  username?: string | null;
  phone_number?: string | null;
}): string | null {
  const username = contact.username?.trim().replace(/^@+/, '') || '';
  const phone = formatPhoneNumber(contact.phone_number);
  if (username && phone) return `@${username} · ${phone}`;
  if (username) return `@${username}`;
  return phone || null;
}
