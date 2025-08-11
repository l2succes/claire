import { View, Text, TextInput, TouchableOpacity, Alert } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { supabase } from '../../services/supabase';

export default function ManualConfirmScreen() {
  const [accessToken, setAccessToken] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    if (!accessToken || !refreshToken) {
      Alert.alert('Error', 'Please enter both tokens');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (error) {
        Alert.alert('Error', error.message);
        return;
      }

      if (data.session) {
        Alert.alert('Success', 'Email confirmed and logged in!');
        router.replace('/(auth)/login');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to confirm');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-white justify-center px-8">
      <Text className="text-2xl font-bold text-gray-900 mb-4">
        Manual Email Confirmation
      </Text>
      
      <Text className="text-gray-600 mb-4">
        Paste the tokens from your email confirmation URL:
      </Text>

      <View className="mb-4">
        <Text className="text-sm font-medium text-gray-700 mb-1">Access Token</Text>
        <TextInput
          className="border border-gray-300 rounded-lg px-4 py-3 text-gray-900"
          placeholder="eyJhbGciOiJIUzI1NiIs..."
          value={accessToken}
          onChangeText={setAccessToken}
          multiline
          numberOfLines={3}
          editable={!loading}
        />
      </View>

      <View className="mb-6">
        <Text className="text-sm font-medium text-gray-700 mb-1">Refresh Token</Text>
        <TextInput
          className="border border-gray-300 rounded-lg px-4 py-3 text-gray-900"
          placeholder="lhobffa5agqr..."
          value={refreshToken}
          onChangeText={setRefreshToken}
          editable={!loading}
        />
      </View>

      <TouchableOpacity
        onPress={handleConfirm}
        disabled={loading}
        className={`bg-green-500 rounded-lg py-4 ${loading ? 'opacity-50' : ''}`}
      >
        <Text className="text-white text-center font-semibold text-lg">
          {loading ? 'Confirming...' : 'Confirm Email'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}