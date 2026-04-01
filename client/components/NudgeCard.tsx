import { View, Text, TouchableOpacity } from 'react-native';
import { Heart, Users, Briefcase, Plane, User } from 'lucide-react-native';
import { ChatCategory } from '../types/conversationSettings';

interface NudgeCardProps {
  contactName: string;
  message: string;
  category: ChatCategory;
  onPress: () => void;
  onDismiss: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type IconComponent = (props: { size: number; color: string }) => any;

const CATEGORY_CONFIG: Record<ChatCategory, {
  Icon: IconComponent;
  color: string;
  containerClass: string;
}> = {
  romantic: { Icon: Heart, color: '#ec4899', containerClass: 'bg-pink-50 dark:bg-pink-950 border-pink-100 dark:border-pink-900' },
  friend:   { Icon: Users, color: '#3b82f6', containerClass: 'bg-blue-50 dark:bg-blue-950 border-blue-100 dark:border-blue-900' },
  business: { Icon: Briefcase, color: '#8b5cf6', containerClass: 'bg-violet-50 dark:bg-violet-950 border-violet-100 dark:border-violet-900' },
  trip:     { Icon: Plane, color: '#10b981', containerClass: 'bg-emerald-50 dark:bg-emerald-950 border-emerald-100 dark:border-emerald-900' },
  personal: { Icon: User, color: '#6b7280', containerClass: 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700' },
};

export function NudgeCard({ contactName, message, category, onPress, onDismiss }: NudgeCardProps) {
  const config = CATEGORY_CONFIG[category];
  const { Icon } = config;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      className={`mx-4 mb-2 rounded-2xl p-3.5 border ${config.containerClass}`}
    >
      <View className="flex-row items-center">
        <View className="w-8 h-8 rounded-full bg-white dark:bg-gray-800 items-center justify-center mr-3">
          <Icon size={15} color={config.color} />
        </View>
        <View className="flex-1">
          <Text className="text-sm font-semibold text-gray-900 dark:text-white mb-0.5">
            {contactName}
          </Text>
          <Text className="text-sm text-gray-500 dark:text-gray-400 leading-4">{message}</Text>
        </View>
        <TouchableOpacity
          onPress={onDismiss}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="ml-2"
        >
          <Text className="text-gray-400 text-lg leading-4">×</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}
