import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useAuthStore } from '../../stores/authStore';
import { router } from 'expo-router';

export default function SettingsScreen() {
  const logout = useAuthStore((state) => state.logout);

  const handleLogout = async () => {
    await logout();
    router.replace('/(auth)/login');
  };

  return (
    <ScrollView className="flex-1 bg-gray-50">
      <View className="p-4">
        <Text className="text-2xl font-bold text-gray-900 mb-6">Settings</Text>
        
        <View className="bg-white rounded-lg p-4 mb-4">
          <Text className="text-lg font-semibold text-gray-900 mb-2">Account</Text>
          <Text className="text-gray-600">Manage your account settings</Text>
        </View>

        <View className="bg-white rounded-lg p-4 mb-4">
          <Text className="text-lg font-semibold text-gray-900 mb-2">Notifications</Text>
          <Text className="text-gray-600">Configure notification preferences</Text>
        </View>

        <View className="bg-white rounded-lg p-4 mb-4">
          <Text className="text-lg font-semibold text-gray-900 mb-2">AI Settings</Text>
          <Text className="text-gray-600">Customize AI response behavior</Text>
        </View>

        <TouchableOpacity
          onPress={handleLogout}
          className="bg-red-500 rounded-lg p-4 mt-8"
        >
          <Text className="text-white text-center font-semibold">Logout</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}