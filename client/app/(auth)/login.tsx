import { View, Text, TouchableOpacity, Image } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { useAuthStore } from '../../stores/authStore';

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((state) => state.login);

  const handleQRLogin = async () => {
    setLoading(true);
    try {
      // TODO: Implement QR code scanning
      // For now, simulate login
      await login('mock-token', { id: '1', email: 'user@example.com' });
      router.replace('/(tabs)/dashboard');
    } catch (error) {
      console.error('Login error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-white justify-center items-center p-6">
      <View className="items-center mb-8">
        <Text className="text-3xl font-bold text-gray-900 mb-2">
          Claire
        </Text>
        <Text className="text-gray-600 text-center">
          Never forget to respond to a message again
        </Text>
      </View>

      <View className="w-full max-w-sm">
        <TouchableOpacity
          onPress={handleQRLogin}
          disabled={loading}
          className={`bg-green-500 rounded-lg p-4 mb-4 ${loading ? 'opacity-50' : ''}`}
        >
          <Text className="text-white text-center font-semibold text-lg">
            {loading ? 'Connecting...' : 'Scan WhatsApp QR Code'}
          </Text>
        </TouchableOpacity>

        <Text className="text-gray-500 text-center text-sm">
          Open WhatsApp on your phone → Settings → Linked Devices → Link a Device
        </Text>
      </View>
    </View>
  );
}