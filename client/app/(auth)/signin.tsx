import { View, Text, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useState } from 'react';
import { router, Link } from 'expo-router';
import { supabase } from '../../services/supabase';
import { GoogleSignInButton } from '../../components/GoogleSignInButton';

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
        
        // Check if user has WhatsApp connected
        const { data: sessions } = await supabase
          .from('whatsapp_sessions')
          .select('*')
          .eq('user_id', data.user.id)
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
      Alert.alert('Error', error.message || 'Failed to sign in');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      className="flex-1 bg-white"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View className="flex-1 justify-center px-8">
        <View className="mb-8">
          <Text className="text-3xl font-bold text-gray-900 mb-2">
            Welcome Back
          </Text>
          <Text className="text-gray-600">
            Sign in to continue to Claire
          </Text>
        </View>

        <View className="space-y-4 mb-6">
          <View>
            <Text className="text-sm font-medium text-gray-700 mb-1">Email</Text>
            <TextInput
              className="border border-gray-300 rounded-lg px-4 py-3 text-gray-900"
              placeholder="john@example.com"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              editable={!loading}
            />
          </View>

          <View>
            <Text className="text-sm font-medium text-gray-700 mb-1">Password</Text>
            <TextInput
              className="border border-gray-300 rounded-lg px-4 py-3 text-gray-900"
              placeholder="••••••••"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!loading}
            />
          </View>
        </View>

        <TouchableOpacity
          onPress={handleSignin}
          disabled={loading}
          className={`bg-green-500 rounded-lg py-4 mb-4 ${loading ? 'opacity-50' : ''}`}
        >
          <Text className="text-white text-center font-semibold text-lg">
            {loading ? 'Signing In...' : 'Sign In'}
          </Text>
        </TouchableOpacity>

        <View className="mb-4">
          <View className="flex-row items-center mb-4">
            <View className="flex-1 h-px bg-gray-300" />
            <Text className="mx-4 text-gray-500">OR</Text>
            <View className="flex-1 h-px bg-gray-300" />
          </View>
          
          <GoogleSignInButton mode="signin" />
        </View>

        <View className="flex-row justify-center">
          <Text className="text-gray-600">Don't have an account? </Text>
          <Link href="/(auth)/signup" asChild>
            <TouchableOpacity>
              <Text className="text-green-500 font-semibold">Sign Up</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}