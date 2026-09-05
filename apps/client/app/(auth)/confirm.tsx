import { View, Text, ActivityIndicator } from 'react-native';
import { useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../services/supabase';
import { platformsApi } from '../../services/platforms';

export default function ConfirmScreen() {
  const params = useLocalSearchParams();

  useEffect(() => {
    handleEmailConfirmation();
  }, []);

  const handleEmailConfirmation = async () => {
    try {
      const code = params.code as string | undefined;
      const access_token = params.access_token as string;
      const refresh_token = params.refresh_token as string;
      const oauthError = params.error_description || params.error;

      if (oauthError) {
        console.error('OAuth callback error:', oauthError);
        router.replace('/(auth)/signin');
        return;
      }

      const result = code
        ? await supabase.auth.exchangeCodeForSession(code)
        : access_token && refresh_token
          ? await supabase.auth.setSession({
              access_token,
              refresh_token,
            })
          : null;

      if (!result) {
        router.replace('/(auth)/signin');
        return;
      }

      if (result.error) {
        console.error('Error setting session:', result.error);
        router.replace('/(auth)/signin');
        return;
      }

      if (result.data.session) {
        const sessions = await platformsApi.getAllSessions();
        if (sessions.some((connectedSession) => connectedSession.status === 'connected')) {
          router.replace('/(tabs)/dashboard');
        } else {
          router.replace('/(auth)/login');
        }
      } else {
        router.replace('/(auth)/signin');
      }
    } catch (error) {
      console.error('Confirmation error:', error);
      router.replace('/(auth)/signin');
    }
  };

  return (
    <View className="flex-1 bg-white justify-center items-center" testID="confirm-screen">
      <ActivityIndicator size="large" color="#10b981" />
      <Text className="text-gray-600 mt-4">Confirming your email...</Text>
    </View>
  );
}
