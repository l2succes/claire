import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Clock } from 'lucide-react-native';
import { PlatformBadge } from './PlatformIcon';
import { Platform } from '../types/platform';
import { formatWaitTime } from '../utils/urgency';

export interface QuickReply {
  text: string;
  tone: string;
}

export interface UrgentMessage {
  id: string;
  chat_id: string;
  contact_name?: string;
  chat_name?: string;
  content: string;
  timestamp: string;
  from_me: boolean;
  is_group: boolean;
  platform?: Platform;
  urgency_score: number;
  quick_replies?: QuickReply[];
}

interface UrgentCardProps {
  message: UrgentMessage;
  onPress: () => void;
  onQuickReply: (text: string, chatId: string) => void;
}

function urgencyStyle(score: number) {
  if (score >= 70) return { border: 'border-l-red-500', badge: 'bg-red-100 dark:bg-red-950', badgeText: 'text-red-700 dark:text-red-300', label: 'Urgent' };
  if (score >= 50) return { border: 'border-l-orange-400', badge: 'bg-orange-100 dark:bg-orange-950', badgeText: 'text-orange-700 dark:text-orange-300', label: 'High' };
  return { border: 'border-l-indigo-400', badge: 'bg-indigo-100 dark:bg-indigo-950', badgeText: 'text-indigo-700 dark:text-indigo-300', label: 'Waiting' };
}

export function UrgentCard({ message, onPress, onQuickReply }: UrgentCardProps) {
  const displayName = message.is_group ? message.chat_name : message.contact_name;
  const waitTime = formatWaitTime(message.timestamp);
  const style = urgencyStyle(message.urgency_score);

  return (
    <View className={`mx-4 bg-white dark:bg-gray-800 rounded-2xl border-l-4 ${style.border} shadow-sm`}>
      {/* Header row */}
      <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
        <View className="flex-row items-center flex-1 mr-2">
          <View className="w-11 h-11 rounded-full bg-indigo-100 dark:bg-indigo-900 items-center justify-center mr-3">
            <Text className="text-base font-bold text-indigo-600 dark:text-indigo-400">
              {(displayName ?? '?')[0].toUpperCase()}
            </Text>
          </View>
          <View className="flex-1">
            <Text className="font-semibold text-gray-900 dark:text-white text-base" numberOfLines={1}>
              {displayName ?? 'Unknown'}
            </Text>
            <View className="flex-row items-center mt-0.5 gap-1.5">
              <Clock size={11} color="#9ca3af" />
              <Text className="text-xs text-gray-500 dark:text-gray-400">
                Waiting {waitTime}
              </Text>
              {message.platform && (
                <PlatformBadge platform={message.platform} size={12} />
              )}
            </View>
          </View>
        </View>
        <View className={`px-2.5 py-1 rounded-full ${style.badge}`}>
          <Text className={`text-xs font-semibold ${style.badgeText}`}>{style.label}</Text>
        </View>
      </View>

      {/* Message preview */}
      <View className="px-4 pb-3">
        <Text className="text-sm text-gray-600 dark:text-gray-400 leading-5" numberOfLines={2}>
          {message.content}
        </Text>
      </View>

      {/* Quick reply chips */}
      {message.quick_replies && message.quick_replies.length > 0 && (
        <View className="pb-3">
          <Text className="px-4 text-xs font-medium text-indigo-500 dark:text-indigo-400 mb-2">
            AI suggestions
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
          >
            {message.quick_replies.map((reply, i) => (
              <TouchableOpacity
                key={i}
                onPress={() => onQuickReply(reply.text, message.chat_id)}
                className="px-3 py-2 rounded-xl border border-indigo-200 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900"
                style={{ maxWidth: 200 }}
              >
                <Text className="text-sm text-indigo-700 dark:text-indigo-300" numberOfLines={2}>
                  {reply.text}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Action button */}
      <View className="px-4 pb-4">
        <TouchableOpacity
          onPress={onPress}
          className="bg-indigo-600 rounded-xl py-2.5 items-center"
        >
          <Text className="text-white font-semibold text-sm">Open Chat</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

interface UrgentOverflowItemProps {
  message: UrgentMessage;
  onPress: () => void;
}

export function UrgentOverflowItem({ message, onPress }: UrgentOverflowItemProps) {
  const displayName = message.is_group ? message.chat_name : message.contact_name;
  const waitTime = formatWaitTime(message.timestamp);
  const style = urgencyStyle(message.urgency_score);

  return (
    <TouchableOpacity onPress={onPress} className="items-center" style={{ width: 64 }}>
      <View className={`w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900 items-center justify-center border-2 ${message.urgency_score >= 70 ? 'border-red-400' : 'border-orange-400'} mb-1`}>
        <Text className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
          {(displayName ?? '?')[0].toUpperCase()}
        </Text>
      </View>
      <Text className="text-xs text-gray-700 dark:text-gray-300 text-center" numberOfLines={1}>
        {displayName}
      </Text>
      <Text className={`text-xs text-center ${style.badgeText}`}>{waitTime}</Text>
    </TouchableOpacity>
  );
}
