import { TouchableOpacity, Text, View, Alert, ActivityIndicator } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { googleAuth } from '../services/googleAuth';
import { supabase } from '../services/supabase';
import { Ionicons } from '@expo/vector-icons';

interface GoogleSignInButtonProps {
  mode: 'signin' | 'signup';
}

export function GoogleSignInButton({ mode }: GoogleSignInButtonProps) {
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

      if (session) {
        // Check if user has WhatsApp connected
        const { data: sessions } = await supabase
          .from('whatsapp_sessions')
          .select('*')
          .eq('user_id', session.user.id)
          .eq('status', 'connected')
          .single();

        if (sessions) {
          // User has WhatsApp connected, go to dashboard
          router.replace('/(tabs)/dashboard');
        } else {
          // Need to connect WhatsApp
          router.replace('/(auth)/login');
        }
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to sign in with Google');
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableOpacity
      onPress={handleGoogleSignIn}
      disabled={loading}
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