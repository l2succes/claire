import { useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../services/supabase';
import { platformsApi } from '../../services/platforms';
import { PlatformStatus } from '../../types/platform';
import {
  EMAIL_OTP_LENGTH,
  getEmailAuthFeedback,
  isValidEmail,
  normalizeEmail,
  normalizeOtpCode,
} from './email-auth-utils';

export type OtpVisualStatus = 'idle' | 'error' | 'success';

const INCOMPLETE_CODE_MESSAGE = `Enter all ${EMAIL_OTP_LENGTH} digits from your email.`;
const MISSING_EMAIL_MESSAGE = 'Your email address is missing. Go back and enter it again.';
const SUCCESS_FEEDBACK_MS = 450;

export function useEmailVerification(emailValue: string) {
  const email = normalizeEmail(emailValue);
  const [code, setCodeValue] = useState('');
  const [error, setError] = useState<string | null>(
    isValidEmail(email) ? null : MISSING_EMAIL_MESSAGE,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<OtpVisualStatus>('idle');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);

  const setCode = (value: string) => {
    setCodeValue(normalizeOtpCode(value));
    setVerificationStatus('idle');
    if (error && isValidEmail(email)) setError(null);
    if (message) setMessage(null);
  };

  const verify = async () => {
    if (!isValidEmail(email)) {
      setError(MISSING_EMAIL_MESSAGE);
      AccessibilityInfo.announceForAccessibility(MISSING_EMAIL_MESSAGE);
      return;
    }
    if (code.length !== EMAIL_OTP_LENGTH) {
      setVerificationStatus('error');
      setError(INCOMPLETE_CODE_MESSAGE);
      AccessibilityInfo.announceForAccessibility(INCOMPLETE_CODE_MESSAGE);
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);
    setVerificationStatus('idle');
    try {
      const { data, error: authError } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: 'email',
      });
      if (authError) throw authError;
      if (!data.session) throw new Error('Could not create a session from this code.');

      setVerificationStatus('success');
      AccessibilityInfo.announceForAccessibility('Email verified.');
      const sessions = await platformsApi.getAllSessions().catch(() => []);
      await new Promise((resolve) => setTimeout(resolve, SUCCESS_FEEDBACK_MS));
      router.replace(
        sessions.some((session) => session.status === PlatformStatus.CONNECTED)
          ? '/(tabs)/dashboard'
          : '/(auth)/login',
      );
    } catch (caughtError) {
      const feedback = getEmailAuthFeedback(caughtError, 'verify');
      setVerificationStatus(feedback.rejectsCode ? 'error' : 'idle');
      setError(feedback.message);
      AccessibilityInfo.announceForAccessibility(feedback.message);
    } finally {
      setLoading(false);
    }
  };

  const resendCode = async () => {
    if (!isValidEmail(email)) {
      setError(MISSING_EMAIL_MESSAGE);
      AccessibilityInfo.announceForAccessibility(MISSING_EMAIL_MESSAGE);
      return;
    }

    setResending(true);
    setError(null);
    setMessage(null);
    try {
      const { error: authError } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
      });
      if (authError) throw authError;

      const successMessage = 'A new code is on its way.';
      setCodeValue('');
      setVerificationStatus('idle');
      setMessage(successMessage);
      setFocusRequest((request) => request + 1);
      AccessibilityInfo.announceForAccessibility(successMessage);
    } catch (caughtError) {
      const feedback = getEmailAuthFeedback(caughtError, 'resend');
      setError(feedback.message);
      AccessibilityInfo.announceForAccessibility(feedback.message);
    } finally {
      setResending(false);
    }
  };

  return {
    email,
    code,
    error,
    message,
    verificationStatus,
    loading,
    resending,
    focusRequest,
    canVerify: code.length === EMAIL_OTP_LENGTH && !loading && !resending && isValidEmail(email),
    setCode,
    verify,
    resendCode,
    changeEmail: () => router.replace('/(auth)/email'),
  };
}
