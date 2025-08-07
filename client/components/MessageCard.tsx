import { View, Text, TouchableOpacity, Image } from 'react-native';
import { formatDistanceToNow } from 'date-fns';
import { User, Users, Check, CheckCheck, Clock } from 'lucide-react-native';
import { useState } from 'react';

interface MessageCardProps {
  message: {
    id: string;
    contact_name?: string;
    contact_avatar?: string;
    chat_name?: string;
    content: string;
    timestamp: string;
    from_me: boolean;
    is_group: boolean;
    status?: 'sent' | 'delivered' | 'read' | 'pending';
    unread_count?: number;
    has_ai_response?: boolean;
  };
  onPress: () => void;
  onLongPress?: () => void;
}

export function MessageCard({ message, onPress, onLongPress }: MessageCardProps) {
  const [imageError, setImageError] = useState(false);

  const getStatusIcon = () => {
    switch (message.status) {
      case 'sent':
        return <Check size={14} color="#6b7280" />;
      case 'delivered':
        return <CheckCheck size={14} color="#6b7280" />;
      case 'read':
        return <CheckCheck size={14} color="#3b82f6" />;
      case 'pending':
        return <Clock size={14} color="#f59e0b" />;
      default:
        return null;
    }
  };

  const timeAgo = formatDistanceToNow(new Date(message.timestamp), { 
    addSuffix: false 
  }).replace('about ', '');

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      className="bg-white dark:bg-gray-800 px-4 py-3 border-b border-gray-100 dark:border-gray-700"
      activeOpacity={0.7}
    >
      <View className="flex-row">
        {/* Avatar */}
        <View className="mr-3">
          {message.contact_avatar && !imageError ? (
            <Image
              source={{ uri: message.contact_avatar }}
              className="w-12 h-12 rounded-full"
              onError={() => setImageError(true)}
            />
          ) : (
            <View className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 items-center justify-center">
              {message.is_group ? (
                <Users size={24} color="#6b7280" />
              ) : (
                <User size={24} color="#6b7280" />
              )}
            </View>
          )}
        </View>

        {/* Content */}
        <View className="flex-1">
          {/* Header */}
          <View className="flex-row justify-between items-start mb-1">
            <View className="flex-1 mr-2">
              <Text className="text-base font-semibold text-gray-900 dark:text-white" numberOfLines={1}>
                {message.chat_name || message.contact_name || 'Unknown'}
              </Text>
            </View>
            <View className="flex-row items-center">
              {message.from_me && getStatusIcon()}
              <Text className="text-xs text-gray-500 dark:text-gray-400 ml-1">
                {timeAgo}
              </Text>
            </View>
          </View>

          {/* Message Preview */}
          <View className="flex-row items-center">
            <Text
              className={`flex-1 text-sm ${
                message.unread_count ? 'text-gray-900 dark:text-white font-medium' : 'text-gray-600 dark:text-gray-300'
              }`}
              numberOfLines={2}
            >
              {message.from_me && <Text className="text-gray-500">You: </Text>}
              {message.content}
            </Text>
          </View>

          {/* Bottom Row - Badges */}
          <View className="flex-row items-center mt-2">
            {message.unread_count && message.unread_count > 0 && (
              <View className="bg-green-500 rounded-full px-2 py-0.5 mr-2">
                <Text className="text-white text-xs font-semibold">
                  {message.unread_count}
                </Text>
              </View>
            )}
            {message.has_ai_response && (
              <View className="bg-blue-100 dark:bg-blue-900 rounded-full px-2 py-0.5">
                <Text className="text-blue-600 dark:text-blue-300 text-xs">
                  AI suggestion
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}