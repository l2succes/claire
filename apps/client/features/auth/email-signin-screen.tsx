import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft, Mail } from 'lucide-react-native';
import { colors, mobileType, radius, space } from '@claire/design-system';
import { supabase } from '../../services/supabase';

export function EmailSignInScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const sendCode = async () => {
    const normalized = email.trim().toLowerCase();
    if (!normalized.includes('@')) return Alert.alert('Enter your email', 'Use the email address you want to use with Claire.');
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({ email: normalized, options: { shouldCreateUser: true } });
      if (error) throw error;
      router.push({ pathname: '/(auth)/verify', params: { email: normalized } });
    } catch (error) {
      Alert.alert('Could not send a code', error instanceof Error ? error.message : 'Please try again.');
    } finally { setLoading(false); }
  };
  return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.sky }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><View style={{ flex: 1, padding: space[6], justifyContent: 'space-between' }}><View><Pressable accessibilityRole="button" onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' }}><ArrowLeft size={20} color={colors.ink} /></Pressable><Text style={{ ...mobileType.monoLabel, color: colors.ink, marginTop: space[10] }}>SIGN IN WITH EMAIL</Text><Text style={{ ...mobileType.display, color: colors.ink, marginTop: space[3] }}>What’s your email?</Text><Text style={{ ...mobileType.body, color: colors.neutral[600], marginTop: space[3] }}>We’ll send a one-time code. No password needed.</Text></View><View style={{ gap: space[3] }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 56, paddingHorizontal: space[3], borderRadius: radius.control, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.neutral[200] }}><Mail size={19} color={colors.neutral[600]} /><TextInput testID="signin-email-input" style={{ flex: 1, ...mobileType.body, color: colors.ink }} placeholder="you@example.com" placeholderTextColor={colors.neutral[400]} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" value={email} onChangeText={setEmail} editable={!loading} /></View><Pressable testID="signin-send-otp" accessibilityRole="button" onPress={() => void sendCode()} disabled={loading} style={{ minHeight: 56, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ink, opacity: loading ? 0.5 : 1 }}><Text style={{ ...mobileType.body, color: colors.lime, fontWeight: '700' }}>{loading ? 'Sending…' : 'Email me a code'}</Text></Pressable></View></View></KeyboardAvoidingView>;
}
