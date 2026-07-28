import { describe, expect, it } from 'bun:test';
import { normalizeWhatsAppPhoneNumber } from './phone-number';

describe('normalizeWhatsAppPhoneNumber', () => {
  it('removes common display formatting', () => {
    expect(normalizeWhatsAppPhoneNumber('+1 (202) 555-0108')).toBe('12025550108');
  });

  it('normalizes a 00 international dialing prefix', () => {
    expect(normalizeWhatsAppPhoneNumber('00 52 55 1234 5678')).toBe('525512345678');
  });

  it('rejects numbers outside the international phone-number length range', () => {
    expect(() => normalizeWhatsAppPhoneNumber('12345')).toThrow(
      'including country code'
    );
    expect(() => normalizeWhatsAppPhoneNumber('1234567890123456')).toThrow(
      'including country code'
    );
  });
});
