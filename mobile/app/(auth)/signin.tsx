import { View, Text, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform as RNPlatform, ScrollView } from 'react-native';
import { useState } from 'react';
import { router, Link } from 'expo-router';
import { supabase } from '../../services/supabase';
import { GoogleSignInButton } from '../../components/GoogleSignInButton';
import { platformsApi } from '../../services/platforms';
import { PlatformStatus } from '../../types/platform';
import { LockKeyhole, Mail, Sparkles } from 'lucide-react-native';
import { colors, mobileType, radius, space } from '@claire/design-system';

export default function SigninScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }

    setLoading(true);
    try {
      // Sign in with Supabase
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        Alert.alert('Sign In Error', error.message);
        return;
      }

      if (data.user && data.session) {
        // User is logged in, auth store will be updated via listener

        // Check if user has any platform connected
        try {
          const sessions = await platformsApi.getAllSessions();
          const hasConnectedPlatform = sessions.some(
            (s) => s.status === PlatformStatus.CONNECTED
          );

          if (hasConnectedPlatform) {
            // User has a platform connected, go to dashboard
            router.replace('/(tabs)/dashboard');
          } else {
            // Need to connect a platform
            router.replace('/(auth)/login');
          }
        } catch {
          // If platform check fails, still proceed to login screen
          router.replace('/(auth)/login');
        }
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to sign in');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.cream }}
      behavior={RNPlatform.OS === 'ios' ? 'padding' : 'height'}
      testID="signin-screen"
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: space[6] }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: space[6] }}>
        <View style={{ gap: space[3] }}>
          <View style={{ width: 52, height: 52, borderRadius: 17, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' }}><Sparkles size={24} color={colors.ink} /></View>
          <View><Text style={{ ...mobileType.display, color: colors.ink }}>Welcome back.</Text><Text style={{ ...mobileType.body, color: colors.neutral[600], marginTop: space[2] }}>Pick up where your conversations left off.</Text></View>
        </View>

        <View style={{ gap: space[3], padding: space[4], borderRadius: radius.card, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.neutral[200] }}>
          <View style={{ gap: space[1] }}>
            <Text style={{ ...mobileType.label, color: colors.neutral[800] }}>Email</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 50, paddingHorizontal: space[3], borderRadius: radius.control, backgroundColor: colors.neutral[100] }}><Mail size={17} color={colors.neutral[600]} />
            <TextInput
              style={{ flex: 1, ...mobileType.body, color: colors.ink, paddingVertical: 0 }}
              placeholder="you@example.com"
              placeholderTextColor={colors.neutral[400]}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              editable={!loading}
              testID="signin-email-input"
            /></View>
          </View>

          <View style={{ gap: space[1] }}>
            <Text style={{ ...mobileType.label, color: colors.neutral[800] }}>Password</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 50, paddingHorizontal: space[3], borderRadius: radius.control, backgroundColor: colors.neutral[100] }}><LockKeyhole size={17} color={colors.neutral[600]} />
            <TextInput
              style={{ flex: 1, ...mobileType.body, color: colors.ink, paddingVertical: 0 }}
              placeholder="••••••••"
              placeholderTextColor={colors.neutral[400]}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!loading}
              testID="signin-password-input"
            /></View>
          </View>

        <TouchableOpacity
          onPress={handleSignin}
          disabled={loading}
          testID="signin-submit"
          style={{ minHeight: 52, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ink, opacity: loading ? 0.5 : 1 }}
        >
          <Text style={{ ...mobileType.body, color: colors.lime, fontWeight: '700' }}>
            {loading ? 'Signing In...' : 'Sign In'}
          </Text>
        </TouchableOpacity>

        <View style={{ gap: space[3] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.neutral[200] }} />
            <Text style={{ ...mobileType.monoLabel, color: colors.neutral[400] }}>OR</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.neutral[200] }} />
          </View>
          
          <GoogleSignInButton mode="signin" />
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
          <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>Don't have an account? </Text>
          <Link href="/(auth)/signup" asChild>
            <TouchableOpacity>
              <Text style={{ ...mobileType.bodySmall, color: colors.ink, fontWeight: '700' }}>Sign Up</Text>
            </TouchableOpacity>
          </Link>
        </View></View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
