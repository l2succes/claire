import { View, Text, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform as RNPlatform, Pressable, ScrollView } from 'react-native';
import { useState } from 'react';
import { router, Link } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LockKeyhole, Mail } from 'lucide-react-native';
import { supabase } from '../../services/supabase';
import { GoogleSignInButton } from '../../components/GoogleSignInButton';
import { platformsApi } from '../../services/platforms';
import { PlatformStatus } from '../../types/platform';
import { ClaireMark } from '../../components/claire/mark';
import { colors, mobileType, radius, space } from '@claire/design-system';

export default function SigninScreen() {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showEmail, setShowEmail] = useState(false);

  const handleSignin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        Alert.alert('Sign In Error', error.message);
        return;
      }

      if (data.user && data.session) {
        try {
          const sessions = await platformsApi.getAllSessions();
          const hasConnectedPlatform = sessions.some(
            (s) => s.status === PlatformStatus.CONNECTED
          );

          if (hasConnectedPlatform) {
            router.replace('/(tabs)/dashboard');
          } else {
            router.replace('/(auth)/login');
          }
        } catch {
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
      style={{ flex: 1, backgroundColor: colors.sky }}
      behavior={RNPlatform.OS === 'ios' ? 'padding' : 'height'}
      testID="signin-screen"
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        <View style={{ flex: 1, backgroundColor: colors.sky, paddingTop: Math.max(insets.top, space[6]), paddingHorizontal: space[6], paddingBottom: space[8], justifyContent: 'space-between' }}>
          <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' }}>
            <ClaireMark size={26} color={colors.ink} dot={colors.paper} />
          </View>
          <View style={{ gap: space[3], paddingBottom: space[4] }}>
            <Text style={{ ...mobileType.monoLabel, color: colors.ink }}>WELCOME TO CLAIRE</Text>
            <Text style={{ ...mobileType.display, color: colors.ink }}>Every conversation.{'\n'}One calm place.</Text>
            <Text style={{ ...mobileType.body, color: colors.neutral[600], maxWidth: 320 }}>
              Bring the people you care about together—and let Claire remember what deserves your attention.
            </Text>
          </View>
        </View>

        <View style={{ backgroundColor: colors.sky, paddingHorizontal: space[5], paddingTop: space[4], paddingBottom: Math.max(insets.bottom, space[5]), gap: space[2] }}>
          <GoogleSignInButton mode="signin" variant="welcome" />
          <Pressable
            testID="signin-use-email"
            accessibilityRole="button"
            onPress={() => setShowEmail((current) => !current)}
            style={{
              minHeight: 52,
              borderRadius: 22,
              borderWidth: 1,
              borderColor: colors.ink,
              backgroundColor: colors.paper,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>
              {showEmail ? 'Hide email sign in' : 'Use email instead'}
            </Text>
          </Pressable>

          {showEmail ? (
            <View style={{ gap: space[3], padding: space[4], borderRadius: radius.card, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.neutral[200], marginTop: space[2] }}>
              <View style={{ gap: space[1] }}>
                <Text style={{ ...mobileType.label, color: colors.neutral[800] }}>Email</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 50, paddingHorizontal: space[3], borderRadius: radius.control, backgroundColor: colors.neutral[100] }}>
                  <Mail size={17} color={colors.neutral[600]} />
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
                  />
                </View>
              </View>

              <View style={{ gap: space[1] }}>
                <Text style={{ ...mobileType.label, color: colors.neutral[800] }}>Password</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 50, paddingHorizontal: space[3], borderRadius: radius.control, backgroundColor: colors.neutral[100] }}>
                  <LockKeyhole size={17} color={colors.neutral[600]} />
                  <TextInput
                    style={{ flex: 1, ...mobileType.body, color: colors.ink, paddingVertical: 0 }}
                    placeholder="••••••••"
                    placeholderTextColor={colors.neutral[400]}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    editable={!loading}
                    testID="signin-password-input"
                  />
                </View>
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

              <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
                <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>Don't have an account? </Text>
                <Link href="/(auth)/signup" asChild>
                  <TouchableOpacity>
                    <Text style={{ ...mobileType.bodySmall, color: colors.ink, fontWeight: '700' }}>Sign Up</Text>
                  </TouchableOpacity>
                </Link>
              </View>
            </View>
          ) : null}

          <Text style={{ ...mobileType.label, color: colors.neutral[600], textAlign: 'center', marginTop: space[2] }}>
            Your messages are never used to train shared AI models.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
