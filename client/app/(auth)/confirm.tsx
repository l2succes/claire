import { View, Text, ActivityIndicator } from 'react-native';
import { useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../services/supabase';

export default function ConfirmScreen() {
  const params = useLocalSearchParams();

  useEffect(() => {
    handleEmailConfirmation();
  }, []);

  const handleEmailConfirmation = async () => {
    try {
      // Extract tokens from URL params
      const access_token = params.access_token as string;
      const refresh_token = params.refresh_token as string;

      if (access_token && refresh_token) {
        // Set the session with the tokens from email confirmation
        const { data, error } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });

        if (error) {
          console.error('Error setting session:', error);
          router.replace('/(auth)/signin');
          return;
        }

        if (data.session) {
          // Email confirmed and user logged in
          // Check if they have WhatsApp connected
          const { data: sessions } = await supabase
            .from('whatsapp_sessions')
            .select('*')
            .eq('user_id', data.session.user.id)
            .eq('status', 'connected')
            .single();

          if (sessions) {
            router.replace('/(tabs)/dashboard');
          } else {
            router.replace('/(auth)/login');
          }
        }
      } else {
        // No tokens, redirect to signin
        router.replace('/(auth)/signin');
      }
    } catch (error) {
      console.error('Confirmation error:', error);
      router.replace('/(auth)/signin');
    }
  };

  return (
    <View className="flex-1 bg-white justify-center items-center">
      <ActivityIndicator size="large" color="#10b981" />
      <Text className="text-gray-600 mt-4">Confirming your email...</Text>
    </View>
  );
}