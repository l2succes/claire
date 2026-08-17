import { useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { KeyRound, Mail } from 'lucide-react-native';
import { colors, mobileType, radius, space } from '@claire/design-system';
import { supabase } from '../../services/supabase';
import { platformsApi } from '../../services/platforms';
import { PlatformStatus } from '../../types/platform';

type Step = 'email' | 'code';

/** Passwordless sign-in that works for both a returning account and first use. */
export function EmailOtpForm() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<Step>('email');
  const [loading, setLoading] = useState(false);

  const requestCode = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail.includes('@')) {
      Alert.alert('Enter your email', 'Use the email address you want to use with Claire.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
      setEmail(normalizedEmail);
      setStep('code');
    } catch (error) {
      Alert.alert('Could not send a code', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async () => {
    if (!code.trim()) {
      Alert.alert('Enter your code', 'Copy the one-time code from the email we sent you.');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: code.trim(),
        type: 'email',
      });
      if (error) throw error;
      if (!data.session) throw new Error('Claire could not create a session from this code.');

      try {
        const sessions = await platformsApi.getAllSessions();
        router.replace(sessions.some((session) => session.status === PlatformStatus.CONNECTED)
          ? '/(tabs)/dashboard'
          : '/(auth)/login');
      } catch {
        router.replace('/(auth)/login');
      }
    } catch (error) {
      Alert.alert('That code did not work', error instanceof Error ? error.message : 'Request a new code and try again.');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    if (loading) return;
    setCode('');
    setStep('email');
  };

  return (
    <View style={{ gap: space[3], padding: space[4], borderRadius: radius.card, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.neutral[200], marginTop: space[2] }}>
      <View style={{ gap: space[1] }}>
        <Text style={{ ...mobileType.label, color: colors.neutral[800] }}>{step === 'email' ? 'Email' : 'One-time code'}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 50, paddingHorizontal: space[3], borderRadius: radius.control, backgroundColor: colors.neutral[100] }}>
          {step === 'email' ? <Mail size={17} color={colors.neutral[600]} /> : <KeyRound size={17} color={colors.neutral[600]} />}
          <TextInput
            style={{ flex: 1, ...mobileType.body, color: colors.ink, paddingVertical: 0, letterSpacing: step === 'code' ? 3 : 0 }}
            placeholder={step === 'email' ? 'you@example.com' : 'Code from your email'}
            placeholderTextColor={colors.neutral[400]}
            value={step === 'email' ? email : code}
            onChangeText={step === 'email' ? setEmail : setCode}
            autoCapitalize="none"
            autoComplete={step === 'email' ? 'email' : 'one-time-code'}
            keyboardType={step === 'email' ? 'email-address' : 'number-pad'}
            textContentType={step === 'email' ? 'emailAddress' : 'oneTimeCode'}
            maxLength={step === 'code' ? 8 : undefined}
            editable={!loading}
            testID={step === 'email' ? 'signin-email-input' : 'signin-otp-input'}
          />
        </View>
      </View>

      {step === 'code' ? (
        <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>We sent a one-time code to {email}. It expires soon and can only be used once.</Text>
      ) : (
        <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>We’ll email a one-time code. No password needed.</Text>
      )}

      <Pressable
        testID={step === 'email' ? 'signin-send-otp' : 'signin-verify-otp'}
        accessibilityRole="button"
        disabled={loading}
        onPress={() => void (step === 'email' ? requestCode() : verifyCode())}
        style={{ minHeight: 52, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ink, opacity: loading ? 0.5 : 1 }}
      >
        <Text style={{ ...mobileType.body, color: colors.lime, fontWeight: '700' }}>
          {loading ? 'Working…' : step === 'email' ? 'Email me a code' : 'Continue'}
        </Text>
      </Pressable>

      {step === 'code' ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Pressable accessibilityRole="button" onPress={reset} disabled={loading}><Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>Use a different email</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => void requestCode()} disabled={loading}><Text style={{ ...mobileType.bodySmall, color: colors.ink, fontWeight: '700' }}>Send another code</Text></Pressable>
        </View>
      ) : null}
    </View>
  );
}
