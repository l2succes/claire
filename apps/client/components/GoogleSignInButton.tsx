import { TouchableOpacity, Text, View, Alert, ActivityIndicator } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { googleAuth } from '../services/googleAuth';
import { platformsApi } from '../services/platforms';
import { Ionicons } from '@expo/vector-icons';
import { colors, mobileType } from '@claire/design-system';

interface GoogleSignInButtonProps {
  mode: 'signin' | 'signup';
  variant?: 'default' | 'welcome';
}

export function GoogleSignInButton({ mode, variant = 'default' }: GoogleSignInButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      const { session, error } = await googleAuth.signInWithGoogle();

      if (error) {
        if (error.message !== 'User cancelled login') {
          Alert.alert('Error', error.message);
        }
        return;
      }

      if (session?.user) {
        // Server-authoritative and platform-agnostic: a Telegram or Instagram
        // connection should not send an otherwise-complete user back through
        // onboarding just because it is not WhatsApp.
        const sessions = await platformsApi.getAllSessions();
        if (sessions.some((connectedSession) => connectedSession.status === 'connected')) {
          router.replace('/(tabs)/dashboard');
        } else {
          // No connected platform yet.
          router.replace('/(auth)/login');
        }
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to sign in with Google');
    } finally {
      setLoading(false);
    }
  };

  if (variant === 'welcome') {
    return (
      <TouchableOpacity
        onPress={handleGoogleSignIn}
        disabled={loading}
        testID={`google-sign-in-${mode}`}
        style={{
          minHeight: 52,
          borderRadius: 22,
          backgroundColor: colors.ink,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: loading ? 0.5 : 1,
        }}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors.paper} />
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="logo-google" size={20} color={colors.paper} />
            <Text style={{ ...mobileType.body, color: colors.paper, fontWeight: '700' }}>Continue with Google</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={handleGoogleSignIn}
      disabled={loading}
      testID={`google-sign-in-${mode}`}
      className={`flex-row items-center justify-center bg-white border border-gray-300 rounded-lg py-4 ${
        loading ? 'opacity-50' : ''
      }`}
    >
      {loading ? (
        <ActivityIndicator size="small" color="#4285F4" />
      ) : (
        <>
          <View className="mr-3">
            <Ionicons name="logo-google" size={20} color="#4285F4" />
          </View>
          <Text className="text-gray-700 font-semibold">
            {mode === 'signin' ? 'Sign in with Google' : 'Sign up with Google'}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}
