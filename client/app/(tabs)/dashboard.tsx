import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { useState } from 'react';

export default function DashboardScreen() {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    // TODO: Refresh messages
    setTimeout(() => setRefreshing(false), 1000);
  };

  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View className="p-4">
        <Text className="text-2xl font-bold text-gray-900 mb-4">Messages</Text>
        <Text className="text-gray-600">Your WhatsApp messages will appear here</Text>
      </View>
    </ScrollView>
  );
}