import {
  formatPhoneNumber,
  formatPhoneNumberInput,
  isOpaqueWhatsAppLid,
  isPhoneNumberFallback,
  isRedactedPhoneFallback,
  normalizePhoneNumber,
} from '../services/phone-numbers';

describe('phone number formatting', () => {
  it('renders a Matrix-backed number in international format', () => {
    expect(formatPhoneNumber('+14155552671@s.whatsapp.net')).toBe('+1 415 555 2671');
  });

  it('formats the input as digits are added', () => {
    expect(formatPhoneNumberInput('+1415', '+141')).toBe('+1 415');
  });

  it('normalizes a valid number to E.164 for storage', () => {
    expect(normalizePhoneNumber('+1 415 555 2671')).toBe('+14155552671');
  });

  it('does not manufacture a canonical value for an invalid number', () => {
    expect(normalizePhoneNumber('+52 931 193 75748')).toBeNull();
  });

  it('does not present a WhatsApp LID as a phone number', () => {
    expect(isOpaqueWhatsAppLid('lid-192204836479059')).toBe(true);
    expect(formatPhoneNumber('lid-192204836479059')).toBe('');
  });

  it('does not treat a WhatsApp privacy mask as a usable number', () => {
    expect(isRedactedPhoneFallback('+1••••••04')).toBe(true);
    expect(formatPhoneNumber('+1••••••04')).toBe('');
  });

  it('recognizes a bridge phone fallback even when it has a WhatsApp suffix', () => {
    expect(isPhoneNumberFallback('+1 415 555 2671 (WA)')).toBe(true);
    expect(isPhoneNumberFallback('Luc')).toBe(false);
  });
});
