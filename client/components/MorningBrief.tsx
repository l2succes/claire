import { View, Text, TouchableOpacity } from 'react-native';
import { useState } from 'react';
import { Sparkles, X } from 'lucide-react-native';

interface MorningBriefProps {
  text: string;
}

export function MorningBrief({ text }: MorningBriefProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <View className="mx-4 mb-5 bg-indigo-50 dark:bg-indigo-950 rounded-2xl p-4 border border-indigo-100 dark:border-indigo-900">
      <View className="flex-row items-start">
        <View className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900 items-center justify-center mr-3 mt-0.5">
          <Sparkles size={15} color="#6366f1" />
        </View>
        <View className="flex-1 mr-2">
          <Text className="text-xs font-semibold text-indigo-500 dark:text-indigo-400 mb-1 uppercase tracking-wide">
            Morning Brief
          </Text>
          <Text className="text-sm text-gray-700 dark:text-gray-300 leading-5">{text}</Text>
        </View>
        <TouchableOpacity onPress={() => setDismissed(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <X size={16} color="#9ca3af" />
        </TouchableOpacity>
      </View>
    </View>
  );
}
