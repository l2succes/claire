import { View, Text, TouchableOpacity } from 'react-native';
import { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react-native';

interface HomeSectionProps {
  title: string;
  subtitle?: string;
  onSeeAll?: () => void;
  children: ReactNode;
}

export function HomeSection({ title, subtitle, onSeeAll, children }: HomeSectionProps) {
  return (
    <View className="mb-5">
      <View className="flex-row justify-between items-center px-4 mb-3">
        <View>
          <Text className="text-base font-semibold text-gray-900 dark:text-white">{title}</Text>
          {subtitle && (
            <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</Text>
          )}
        </View>
        {onSeeAll && (
          <TouchableOpacity onPress={onSeeAll} className="flex-row items-center">
            <Text className="text-sm text-indigo-600 dark:text-indigo-400 mr-0.5">See all</Text>
            <ChevronRight size={14} color="#4f46e5" />
          </TouchableOpacity>
        )}
      </View>
      {children}
    </View>
  );
}
