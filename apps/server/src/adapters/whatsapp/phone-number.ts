/**
 * Convert a user-entered international phone number to the digit-only format
 * expected by whatsapp-web.js (for example, +1 202 555 0108 → 12025550108).
 */
export function normalizeWhatsAppPhoneNumber(value: string): string {
  let digits = value.replace(/\D/g, '');

  // Treat an international dialing prefix the same as a leading plus sign.
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }

  if (digits.length < 8 || digits.length > 15) {
    throw new Error(
      'Enter a valid WhatsApp phone number including country code (8–15 digits)'
    );
  }

  return digits;
}
