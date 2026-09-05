export const EMAIL_OTP_LENGTH = 6;

export type EmailAuthOperation = 'send' | 'verify' | 'resend';
export type EmailAuthErrorKind =
  | 'invalid_email'
  | 'invalid_code'
  | 'expired_code'
  | 'rate_limit'
  | 'network'
  | 'unknown';

export type EmailAuthFeedback = {
  kind: EmailAuthErrorKind;
  message: string;
  rejectsCode: boolean;
};

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string) {
  const normalized = normalizeEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

export function normalizeOtpCode(value: string) {
  return value.replace(/\D/g, '').slice(0, EMAIL_OTP_LENGTH);
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message.toLowerCase();
  if (typeof error === 'string') return error.toLowerCase();
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message).toLowerCase();
  }
  return '';
}

export function getEmailAuthFeedback(
  error: unknown,
  operation: EmailAuthOperation,
): EmailAuthFeedback {
  const message = errorMessage(error);

  if (/network|fetch|offline|connection|timeout/.test(message)) {
    return {
      kind: 'network',
      message: 'Check your connection and try again.',
      rejectsCode: false,
    };
  }

  if (/rate|too many|429|security purposes/.test(message)) {
    return {
      kind: 'rate_limit',
      message:
        operation === 'verify'
          ? 'Too many attempts. Wait a moment, then try again or request a new code.'
          : 'Too many codes were requested. Wait a moment before trying again.',
      rejectsCode: false,
    };
  }

  if (operation === 'verify' && /expired|expiry/.test(message)) {
    return {
      kind: 'expired_code',
      message: 'That code has expired. Request a new one and try again.',
      rejectsCode: true,
    };
  }

  if (operation === 'verify' && /token|otp|code|invalid|incorrect/.test(message)) {
    return {
      kind: 'invalid_code',
      message: 'That code is incorrect. Check the email and try again.',
      rejectsCode: true,
    };
  }

  if (/email|address/.test(message)) {
    return {
      kind: 'invalid_email',
      message: 'Enter a valid email address and try again.',
      rejectsCode: false,
    };
  }

  return {
    kind: 'unknown',
    message:
      operation === 'verify'
        ? 'Claire couldn’t verify that code. Try again or request a new one.'
        : operation === 'resend'
          ? 'Claire couldn’t send a new code. Please try again.'
          : 'Claire couldn’t send a code. Please try again.',
    rejectsCode: false,
  };
}
