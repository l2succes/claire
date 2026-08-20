import {
  formatIncompletePhoneNumber,
  getCountries,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js';

const countries = new Set<CountryCode>(getCountries());

function deviceCountry(): CountryCode {
  const locale = Intl.DateTimeFormat().resolvedOptions().locale || '';
  const country = locale
    .split(/[-_]/)
    .reverse()
    .find((part) => /^[A-Za-z]{2}$/.test(part))
    ?.toUpperCase() as CountryCode | undefined;

  return country && countries.has(country) ? country : 'US';
}

/** Remove a Matrix address suffix while preserving an E.164 phone number. */
function sourcePhone(value: string) {
  return value.trim().split('@')[0] || value.trim();
}

/** A WhatsApp LID is a routing identifier, not a telephone number. */
export function isOpaqueWhatsAppLid(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^lid[-:]?\d+$/i.test(sourcePhone(value));
}

/** WhatsApp's bridge fallback is a privacy mask, not a usable phone number. */
export function isRedactedPhoneFallback(value: string | null | undefined): boolean {
  const source = sourcePhone(value || '');
  return Boolean(source) && /^[+0-9\s().•*-]+$/.test(source) && /[•*]/.test(source);
}

/** A bridge display-name fallback containing only a phone number (optionally suffixed with `(WA)`). */
export function isPhoneNumberFallback(value: string | null | undefined): boolean {
  const source = sourcePhone(value || '').replace(/\s*\(WA\)\s*$/i, '');
  return /^\+?[0-9][0-9\s().-]{6,}$/.test(source);
}

/** Human-readable number for the relationship-memory surface. */
export function formatPhoneNumber(value: string | null | undefined): string {
  if (!value) return '';
  const source = sourcePhone(value);
  // Never turn an opaque WhatsApp LID into a plausible-looking number. That
  // would mislead someone into thinking it is a callable contact detail.
  if (isOpaqueWhatsAppLid(source) || isRedactedPhoneFallback(source)) return '';
  const parsed = parsePhoneNumberFromString(source, deviceCountry());
  if (parsed?.isValid()) return parsed.formatInternational();

  // Keep partially entered values useful, but never invent an E.164 value.
  return formatIncompletePhoneNumber(source, deviceCountry()) || source;
}

/**
 * Blaze's phone input behavior: apply the international/national mask while
 * characters are added, but keep the raw edit when someone is deleting a
 * separator so the cursor and backspace behave naturally on mobile.
 */
export function formatPhoneNumberInput(nextValue: string, previousValue: string): string {
  if (!nextValue) return '';
  const formatted = formatIncompletePhoneNumber(nextValue, deviceCountry());
  return nextValue.length > previousValue.length && /\d$/.test(formatted)
    ? formatted
    : nextValue;
}

/** Canonical storage form. A non-empty invalid number intentionally returns null. */
export function normalizePhoneNumber(value: string): string | null {
  const source = sourcePhone(value);
  if (!source) return null;
  const parsed = parsePhoneNumberFromString(source, deviceCountry());
  return parsed?.isValid() ? parsed.number : null;
}
