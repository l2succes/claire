import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, KeyRound } from 'lucide-react-native';
import { colors, mobileType, radius, space } from '@claire/design-system';
import { supabase } from '../../services/supabase';
import { platformsApi } from '../../services/platforms';
import { PlatformStatus } from '../../types/platform';

export function EmailVerificationScreen() {
  const { email = '' } = useLocalSearchParams<{ email?: string }>();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const verify = async () => {
    if (!code.trim()) return Alert.alert('Enter your code', 'Copy the one-time code from the email we sent you.');
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: 'email' });
      if (error) throw error;
      if (!data.session) throw new Error('Claire could not create a session from this code.');
      const sessions = await platformsApi.getAllSessions().catch(() => []);
      router.replace(sessions.some((session) => session.status === PlatformStatus.CONNECTED) ? '/(tabs)/dashboard' : '/(auth)/login');
    } catch (error) { Alert.alert('That code did not work', error instanceof Error ? error.message : 'Request a new code and try again.'); }
    finally { setLoading(false); }
  };
  return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.sky }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><View style={{ flex: 1, padding: space[6], justifyContent: 'space-between' }}><View><Pressable accessibilityRole="button" onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' }}><ArrowLeft size={20} color={colors.ink} /></Pressable><Text style={{ ...mobileType.monoLabel, color: colors.ink, marginTop: space[10] }}>CHECK YOUR EMAIL</Text><Text style={{ ...mobileType.display, color: colors.ink, marginTop: space[3] }}>Enter your code</Text><Text style={{ ...mobileType.body, color: colors.neutral[600], marginTop: space[3] }}>We sent a one-time code to {email}. It expires soon and can only be used once.</Text></View><View style={{ gap: space[3] }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 56, paddingHorizontal: space[3], borderRadius: radius.control, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.neutral[200] }}><KeyRound size={19} color={colors.neutral[600]} /><TextInput testID="signin-otp-input" style={{ flex: 1, ...mobileType.body, color: colors.ink, letterSpacing: 3 }} placeholder="Code from your email" placeholderTextColor={colors.neutral[400]} autoComplete="one-time-code" keyboardType="number-pad" textContentType="oneTimeCode" maxLength={8} value={code} onChangeText={setCode} editable={!loading} /></View><Pressable testID="signin-verify-otp" accessibilityRole="button" onPress={() => void verify()} disabled={loading} style={{ minHeight: 56, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ink, opacity: loading ? 0.5 : 1 }}><Text style={{ ...mobileType.body, color: colors.lime, fontWeight: '700' }}>{loading ? 'Verifying…' : 'Continue'}</Text></Pressable></View></View></KeyboardAvoidingView>;
}
