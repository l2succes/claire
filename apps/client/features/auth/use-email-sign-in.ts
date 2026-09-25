import { useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../services/supabase';
import {
  type EmailAuthErrorKind,
  getEmailAuthFeedback,
  isValidEmail,
  normalizeEmail,
} from './email-auth-utils';

const INVALID_EMAIL_MESSAGE = 'Enter a valid email address.';

export function useEmailSignIn() {
  const [email, setEmailValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<EmailAuthErrorKind | null>(null);
  const [loading, setLoading] = useState(false);

  const setEmail = (value: string) => {
    setEmailValue(value);
    if (error) {
      setError(null);
      setErrorKind(null);
    }
  };

  const validateEmail = () => {
    if (!email.trim()) return;
    if (!isValidEmail(email)) {
      setError(INVALID_EMAIL_MESSAGE);
      setErrorKind('invalid_email');
    }
  };

  const sendCode = async () => {
    const normalized = normalizeEmail(email);
    if (!isValidEmail(normalized)) {
      setError(INVALID_EMAIL_MESSAGE);
      setErrorKind('invalid_email');
      AccessibilityInfo.announceForAccessibility(INVALID_EMAIL_MESSAGE);
      return;
    }

    setLoading(true);
    setError(null);
    setErrorKind(null);
    try {
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: normalized,
        options: { shouldCreateUser: true },
      });
      if (authError) throw authError;
      router.push({ pathname: '/(auth)/verify', params: { email: normalized } });
    } catch (caughtError) {
      const feedback = getEmailAuthFeedback(caughtError, 'send');
      setError(feedback.message);
      setErrorKind(feedback.kind);
      AccessibilityInfo.announceForAccessibility(feedback.message);
    } finally {
      setLoading(false);
    }
  };

  return {
    email,
    error,
    emailInvalid: errorKind === 'invalid_email',
    loading,
    canSubmit: email.trim().length > 0 && !loading,
    setEmail,
    sendCode,
    validateEmail,
  };
}
