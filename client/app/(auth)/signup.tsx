import { View, Text, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useState } from 'react';
import { router, Link } from 'expo-router';
import { supabase } from '../../services/supabase';
import { GoogleSignInButton } from '../../components/GoogleSignInButton';

export default function SignupScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    if (!email || !password || !name) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      // Sign up with Supabase
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name },
          emailRedirectTo: 'claire://auth/confirm', // Deep link for mobile app
        },
      });

      if (error) {
        Alert.alert('Signup Error', error.message);
        return;
      }

      if (data.user) {
        if (data.session) {
          // User is automatically logged in after signup (email confirmation disabled)
          // The auth store will be updated via the Supabase auth listener
          router.replace('/(auth)/login');
        } else {
          // Email confirmation required
          Alert.alert(
            'Confirm Your Email',
            'Please check your email and click the confirmation link to activate your account.',
            [{ text: 'OK', onPress: () => router.replace('/(auth)/signin') }]
          );
        }
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to sign up');
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
            Create Account
          </Text>
          <Text className="text-gray-600">
            Sign up to start using Claire
          </Text>
        </View>

        <View className="space-y-4 mb-6">
          <View>
            <Text className="text-sm font-medium text-gray-700 mb-1">Name</Text>
            <TextInput
              className="border border-gray-300 rounded-lg px-4 py-3 text-gray-900"
              placeholder="John Doe"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              editable={!loading}
            />
          </View>

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
          onPress={handleSignup}
          disabled={loading}
          className={`bg-green-500 rounded-lg py-4 mb-4 ${loading ? 'opacity-50' : ''}`}
        >
          <Text className="text-white text-center font-semibold text-lg">
            {loading ? 'Creating Account...' : 'Sign Up'}
          </Text>
        </TouchableOpacity>

        <View className="mb-4">
          <View className="flex-row items-center mb-4">
            <View className="flex-1 h-px bg-gray-300" />
            <Text className="mx-4 text-gray-500">OR</Text>
            <View className="flex-1 h-px bg-gray-300" />
          </View>
          
          <GoogleSignInButton mode="signup" />
        </View>

        <View className="flex-row justify-center">
          <Text className="text-gray-600">Already have an account? </Text>
          <Link href="/(auth)/signin" asChild>
            <TouchableOpacity>
              <Text className="text-green-500 font-semibold">Sign In</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}