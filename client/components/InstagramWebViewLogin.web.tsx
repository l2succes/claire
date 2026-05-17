import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { X, Eye, EyeOff, Instagram, Shield, AlertCircle } from 'lucide-react-native';
import { Button } from './ui/Button';
import type { InstagramLoginStep, InstagramLoginSubmission } from '../types/platform';
import { supabase } from '../services/supabase';
import { API_BASE_URL } from '../services/platforms';

interface InstagramWebViewLoginProps {
  loginStep?: InstagramLoginStep | null;
  onSuccess: (submission: InstagramLoginSubmission) => void;
  onCancel: () => void;
}

type LoginState = 'idle' | 'loading' | 'two_factor' | 'challenge' | 'error' | 'success';

export function InstagramWebViewLogin({
  loginStep,
  onSuccess,
  onCancel,
}: InstagramWebViewLoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [loginState, setLoginState] = useState<LoginState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [twoFactorLoginId, setTwoFactorLoginId] = useState('');
  const [twoFactorMessage, setTwoFactorMessage] = useState('');

  const handleSignIn = async () => {
    if (!username.trim() || !password.trim()) return;

    setLoginState('loading');
    setErrorMessage('');

    try {
      // Get auth token from Supabase
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`${API_BASE_URL}/platforms/instagram/login/credentials`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Login failed');
      }

      if (data.success && data.cookies) {
        // Direct success - got cookies
        setLoginState('success');
        onSuccess({ cookies: data.cookies });
      } else if (data.status === 'two_factor_required') {
        // Need 2FA code
        setLoginState('two_factor');
        setTwoFactorLoginId(data.loginId || '');
        setTwoFactorMessage(data.message || 'Enter the verification code from your authentication app');
      } else if (data.status === 'challenge_required') {
        // Instagram challenge/suspicious login
        setLoginState('challenge');
        setErrorMessage('Instagram requires additional verification. Please log in on instagram.com first to verify your account, then try again here.');
      } else {
        throw new Error('Unexpected response from server');
      }
    } catch (error) {
      console.error('Instagram login error:', error);
      setLoginState('error');
      setErrorMessage(error instanceof Error ? error.message : 'Failed to sign in. Please try again.');
    }
  };

  const handleSubmit2FA = async () => {
    if (!verificationCode.trim() || !twoFactorLoginId) return;

    setLoginState('loading');
    setErrorMessage('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`${API_BASE_URL}/platforms/instagram/login/2fa`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          loginId: twoFactorLoginId,
          code: verificationCode.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || '2FA verification failed');
      }

      if (data.success && data.cookies) {
        setLoginState('success');
        onSuccess({ cookies: data.cookies });
      } else {
        throw new Error(data.error || 'Invalid verification code');
      }
    } catch (error) {
      console.error('2FA verification error:', error);
      setLoginState('error');
      setErrorMessage(error instanceof Error ? error.message : 'Failed to verify code. Please try again.');
    }
  };

  const handleTryAgain = () => {
    setLoginState('idle');
    setErrorMessage('');
    setUsername('');
    setPassword('');
    setVerificationCode('');
    setTwoFactorLoginId('');
  };

  const renderIdleState = () => (
    <>
      <View style={styles.iconContainer}>
        <View style={styles.instagramIconWrapper}>
          <Instagram size={48} color="#fff" />
        </View>
      </View>

      <Text style={styles.subtitle}>
        Sign in with your Instagram account to connect your messages
      </Text>

      <View style={styles.formContainer}>
        <View style={styles.inputContainer}>
          <View style={styles.inputWrapper}>
            <Text style={styles.atSymbol}>@</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              placeholder="username"
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              testID="instagram-username-input"
            />
          </View>
        </View>

        <View style={styles.inputContainer}>
          <View style={styles.inputWrapper}>
            <TextInput
              style={[styles.input, styles.passwordInput]}
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor="#9ca3af"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="password"
              testID="instagram-password-input"
            />
            <TouchableOpacity
              onPress={() => setShowPassword(!showPassword)}
              style={styles.eyeButton}
              testID="instagram-toggle-password"
            >
              {showPassword ? (
                <EyeOff size={20} color="#6b7280" />
              ) : (
                <Eye size={20} color="#6b7280" />
              )}
            </TouchableOpacity>
          </View>
        </View>

        <Button
          variant="primary"
          onPress={handleSignIn}
          disabled={!username.trim() || !password.trim()}
          style={styles.signInButton}
          testID="instagram-sign-in-button"
        >
          Sign In
        </Button>
      </View>

      <Text style={styles.privacyNote}>
        Your credentials are sent securely to Instagram via our server and never stored.
      </Text>
    </>
  );

  const renderLoadingState = () => (
    <View style={styles.centerContainer}>
      <ActivityIndicator size="large" color="#E1306C" />
      <Text style={styles.loadingText}>Signing in to Instagram...</Text>
      <Text style={styles.loadingSubtext}>This may take a few moments</Text>
    </View>
  );

  const renderTwoFactorState = () => (
    <>
      <View style={styles.iconContainer}>
        <View style={styles.shieldIconWrapper}>
          <Shield size={48} color="#E1306C" />
        </View>
      </View>

      <Text style={styles.subtitle}>{twoFactorMessage}</Text>

      <View style={styles.formContainer}>
        <View style={styles.inputContainer}>
          <TextInput
            style={[styles.input, styles.codeInput]}
            value={verificationCode}
            onChangeText={setVerificationCode}
            placeholder="000000"
            placeholderTextColor="#9ca3af"
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
            testID="instagram-2fa-input"
          />
        </View>

        <Button
          variant="primary"
          onPress={handleSubmit2FA}
          disabled={!verificationCode.trim()}
          style={styles.signInButton}
          testID="instagram-2fa-submit"
        >
          Verify Code
        </Button>
      </View>

      <TouchableOpacity onPress={handleTryAgain} style={styles.backButton}>
        <Text style={styles.backButtonText}>Back to login</Text>
      </TouchableOpacity>
    </>
  );

  const renderChallengeState = () => (
    <View style={styles.centerContainer}>
      <View style={styles.alertIconWrapper}>
        <AlertCircle size={48} color="#f59e0b" />
      </View>
      <Text style={styles.challengeTitle}>Additional Verification Required</Text>
      <Text style={styles.challengeMessage}>{errorMessage}</Text>
      <Button
        variant="primary"
        onPress={handleTryAgain}
        style={styles.tryAgainButton}
        testID="instagram-try-again"
      >
        Try Again
      </Button>
    </View>
  );

  const renderErrorState = () => (
    <>
      <View style={styles.errorBanner}>
        <AlertCircle size={20} color="#ef4444" />
        <Text style={styles.errorText}>{errorMessage}</Text>
      </View>
      {renderIdleState()}
    </>
  );

  return (
    <View style={styles.container} testID="instagram-web-login">
      <View style={styles.header}>
        <TouchableOpacity onPress={onCancel} style={styles.closeBtn} testID="instagram-web-login-close">
          <X size={20} color="#6b7280" />
        </TouchableOpacity>
        <Text style={styles.title}>Connect Instagram</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {loginState === 'idle' && renderIdleState()}
        {loginState === 'loading' && renderLoadingState()}
        {loginState === 'two_factor' && renderTwoFactorState()}
        {loginState === 'challenge' && renderChallengeState()}
        {loginState === 'error' && renderErrorState()}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  closeBtn: {
    padding: 8,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 16,
    color: '#111827',
  },
  placeholder: {
    width: 36,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 24,
    gap: 20,
  },
  iconContainer: {
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  instagramIconWrapper: {
    width: 96,
    height: 96,
    borderRadius: 24,
    backgroundColor: '#E1306C',
    justifyContent: 'center',
    alignItems: 'center',
    // Instagram gradient (approximated with solid color for simplicity)
  },
  shieldIconWrapper: {
    width: 96,
    height: 96,
    borderRadius: 24,
    backgroundColor: '#fce7f3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertIconWrapper: {
    width: 96,
    height: 96,
    borderRadius: 24,
    backgroundColor: '#fef3c7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 8,
  },
  formContainer: {
    gap: 16,
    marginTop: 8,
  },
  inputContainer: {
    gap: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#d1d5db',
    borderRadius: 12,
    backgroundColor: '#f9fafb',
    paddingHorizontal: 16,
    height: 52,
  },
  atSymbol: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
    marginRight: 4,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
    padding: 0,
  },
  passwordInput: {
    paddingRight: 40,
  },
  codeInput: {
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '600',
    letterSpacing: 8,
  },
  eyeButton: {
    position: 'absolute',
    right: 16,
    padding: 4,
  },
  signInButton: {
    height: 52,
    borderRadius: 12,
    backgroundColor: '#E1306C',
    marginTop: 8,
  },
  privacyNote: {
    fontSize: 13,
    color: '#9ca3af',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  loadingText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginTop: 16,
  },
  loadingSubtext: {
    fontSize: 14,
    color: '#6b7280',
  },
  backButton: {
    padding: 12,
    marginTop: 8,
  },
  backButtonText: {
    fontSize: 15,
    color: '#E1306C',
    fontWeight: '600',
    textAlign: 'center',
  },
  challengeTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
    marginTop: 8,
  },
  challengeMessage: {
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  tryAgainButton: {
    height: 52,
    borderRadius: 12,
    backgroundColor: '#E1306C',
    marginTop: 24,
    paddingHorizontal: 32,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fee2e2',
    borderLeftWidth: 4,
    borderLeftColor: '#ef4444',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: '#991b1b',
    lineHeight: 20,
  },
});
