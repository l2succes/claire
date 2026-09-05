import {
  EMAIL_OTP_LENGTH,
  getEmailAuthFeedback,
  isValidEmail,
  normalizeEmail,
  normalizeOtpCode,
} from '../features/auth/email-auth-utils';

describe('email authentication helpers', () => {
  it('normalizes and validates email addresses without accepting partial addresses', () => {
    expect(normalizeEmail('  Luc+Claire@Example.COM ')).toBe('luc+claire@example.com');
    expect(isValidEmail('luc+claire@example.com')).toBe(true);
    expect(isValidEmail('luc@example')).toBe(false);
    expect(isValidEmail('luc @example.com')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });

  it('keeps only the first six OTP digits from typing or paste', () => {
    expect(EMAIL_OTP_LENGTH).toBe(6);
    expect(normalizeOtpCode(' 12a-34 5678 ')).toBe('123456');
    expect(normalizeOtpCode('code')).toBe('');
  });

  it.each([
    ['Token has expired', 'expired_code', true, 'expired'],
    ['Token is invalid', 'invalid_code', true, 'incorrect'],
    ['Email rate limit exceeded', 'rate_limit', false, 'Too many attempts'],
    ['Network request failed', 'network', false, 'connection'],
  ] as const)(
    'maps %s to recoverable verification feedback',
    (serverMessage, expectedKind, rejectsCode, copy) => {
      const feedback = getEmailAuthFeedback(new Error(serverMessage), 'verify');
      expect(feedback.kind).toBe(expectedKind);
      expect(feedback.rejectsCode).toBe(rejectsCode);
      expect(feedback.message).toContain(copy);
    },
  );

  it('uses operation-specific generic recovery copy', () => {
    expect(getEmailAuthFeedback(new Error('Unexpected'), 'send').message).toContain('send a code');
    expect(getEmailAuthFeedback(new Error('Unexpected'), 'resend').message).toContain('new code');
    expect(getEmailAuthFeedback(new Error('Unexpected'), 'verify').message).toContain('verify');
  });
});
