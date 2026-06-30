import { View, Text, ScrollView } from 'react-native';

export default function PromisesScreen() {
  return (
    <ScrollView className="flex-1 bg-gray-50" testID="promises-screen">
      <View className="p-4">
        <Text className="text-2xl font-bold text-gray-900 mb-4">Promises</Text>
        <View testID="promises-empty">
          <Text className="text-gray-600">Your commitments and promises will be tracked here</Text>
        </View>
      </View>
    </ScrollView>
  );
}