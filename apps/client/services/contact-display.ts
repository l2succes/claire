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
