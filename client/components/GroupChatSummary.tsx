import { View, Text, TouchableOpacity } from 'react-native';
import { useState, useEffect } from 'react';
import { Users, TrendingUp, Clock, ChevronRight } from 'lucide-react-native';
import { supabase } from '../services/supabase';
import { formatDistanceToNow } from 'date-fns';

interface GroupChatSummaryProps {
  chatId: string;
  userId: string;
  onViewDetails?: () => void;
}

interface GroupStats {
  totalMessages: number;
  activeParticipants: number;
  lastActivityTime: string;
  topContributors: Array<{
    name: string;
    messageCount: number;
    percentage: number;
  }>;
  recentTopics: string[];
  peakActivityHour: number;
  averageResponseTime: number;
}

export function GroupChatSummary({ chatId, userId, onViewDetails }: GroupChatSummaryProps) {
  const [stats, setStats] = useState<GroupStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetchGroupStats();
  }, [chatId]);

  const fetchGroupStats = async () => {
    try {
      // Fetch group messages
      const { data: messages, error } = await supabase
        .from('messages')
        .select('*')
        .eq('whatsapp_chat_id', chatId)
        .eq('user_id', userId)
        .eq('is_group', true)
        .order('timestamp', { ascending: false })
        .limit(500);

      if (error) throw error;

      if (!messages || messages.length === 0) {
        setLoading(false);
        return;
      }

      // Calculate statistics
      const participantMap = new Map<string, number>();
      const hourMap = new Map<number, number>();
      let totalResponseTime = 0;
      let responseCount = 0;

      messages.forEach((msg, index) => {
        // Count messages per participant
        const participant = msg.contact_name || 'Unknown';
        participantMap.set(participant, (participantMap.get(participant) || 0) + 1);

        // Track peak activity hours
        const hour = new Date(msg.timestamp).getHours();
        hourMap.set(hour, (hourMap.get(hour) || 0) + 1);

        // Calculate response times
        if (index > 0 && !msg.from_me) {
          const prevMsg = messages[index - 1];
          if (prevMsg.from_me) {
            const responseTime = new Date(msg.timestamp).getTime() - new Date(prevMsg.timestamp).getTime();
            totalResponseTime += responseTime;
            responseCount++;
          }
        }
      });

      // Get top contributors
      const topContributors = Array.from(participantMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({
          name,
          messageCount: count,
          percentage: Math.round((count / messages.length) * 100),
        }));

      // Find peak activity hour
      let peakHour = 0;
      let peakCount = 0;
      hourMap.forEach((count, hour) => {
        if (count > peakCount) {
          peakCount = count;
          peakHour = hour;
        }
      });

      // Extract recent topics (simplified - just look for frequently used words)
      const recentMessages = messages.slice(0, 50);
      const wordFrequency = new Map<string, number>();
      
      recentMessages.forEach(msg => {
        const words = msg.content.toLowerCase().split(/\s+/);
        words.forEach((word: string) => {
          if (word.length > 4 && !['hello', 'thanks', 'please', 'today'].includes(word)) {
            wordFrequency.set(word, (wordFrequency.get(word) || 0) + 1);
          }
        });
      });

      const recentTopics = Array.from(wordFrequency.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([word]) => word);

      setStats({
        totalMessages: messages.length,
        activeParticipants: participantMap.size,
        lastActivityTime: messages[0].timestamp,
        topContributors,
        recentTopics,
        peakActivityHour: peakHour,
        averageResponseTime: responseCount > 0 ? totalResponseTime / responseCount / 1000 / 60 : 0, // in minutes
      });
    } catch (error) {
      console.error('Error fetching group stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View className="bg-white dark:bg-gray-800 rounded-lg p-4 m-4">
        <Text className="text-gray-500 dark:text-gray-400">Loading group statistics...</Text>
      </View>
    );
  }

  if (!stats) {
    return null;
  }

  const formatHour = (hour: number) => {
    if (hour === 0) return '12 AM';
    if (hour === 12) return '12 PM';
    return hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
  };

  return (
    <View className="bg-white dark:bg-gray-800 rounded-lg m-4 overflow-hidden">
      <TouchableOpacity
        onPress={() => setExpanded(!expanded)}
        className="p-4"
      >
        {/* Header */}
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center">
            <Users size={20} color="#3b82f6" />
            <Text className="ml-2 text-lg font-semibold text-gray-900 dark:text-white">
              Group Activity Summary
            </Text>
          </View>
          <View style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}>
            <ChevronRight 
              size={20} 
              color="#6b7280"
            />
          </View>
        </View>

        {/* Quick Stats */}
        <View className="flex-row justify-between">
          <View className="flex-1">
            <Text className="text-2xl font-bold text-gray-900 dark:text-white">
              {stats.totalMessages}
            </Text>
            <Text className="text-xs text-gray-500 dark:text-gray-400">
              Total Messages
            </Text>
          </View>
          <View className="flex-1">
            <Text className="text-2xl font-bold text-gray-900 dark:text-white">
              {stats.activeParticipants}
            </Text>
            <Text className="text-xs text-gray-500 dark:text-gray-400">
              Active Members
            </Text>
          </View>
          <View className="flex-1">
            <Text className="text-sm font-medium text-gray-900 dark:text-white">
              {formatDistanceToNow(new Date(stats.lastActivityTime), { addSuffix: true })}
            </Text>
            <Text className="text-xs text-gray-500 dark:text-gray-400">
              Last Activity
            </Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* Expanded Details */}
      {expanded && (
        <View className="px-4 pb-4 border-t border-gray-200 dark:border-gray-700 mt-3 pt-3">
          {/* Top Contributors */}
          <View className="mb-4">
            <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Top Contributors
            </Text>
            {stats.topContributors.map((contributor, index) => (
              <View key={index} className="flex-row items-center justify-between mb-1">
                <Text className="text-sm text-gray-600 dark:text-gray-400">
                  {contributor.name}
                </Text>
                <View className="flex-row items-center">
                  <View className="bg-gray-200 dark:bg-gray-700 rounded-full h-2 w-20 mr-2">
                    <View 
                      className="bg-blue-500 rounded-full h-2"
                      style={{ width: `${contributor.percentage}%` }}
                    />
                  </View>
                  <Text className="text-xs text-gray-500 dark:text-gray-400 w-10 text-right">
                    {contributor.percentage}%
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {/* Activity Insights */}
          <View className="flex-row justify-between mb-4">
            <View className="flex-1 mr-2">
              <View className="flex-row items-center mb-1">
                <Clock size={14} color="#6b7280" />
                <Text className="ml-1 text-xs font-medium text-gray-700 dark:text-gray-300">
                  Peak Activity
                </Text>
              </View>
              <Text className="text-sm text-gray-600 dark:text-gray-400">
                {formatHour(stats.peakActivityHour)}
              </Text>
            </View>
            <View className="flex-1">
              <View className="flex-row items-center mb-1">
                <TrendingUp size={14} color="#6b7280" />
                <Text className="ml-1 text-xs font-medium text-gray-700 dark:text-gray-300">
                  Avg Response
                </Text>
              </View>
              <Text className="text-sm text-gray-600 dark:text-gray-400">
                {stats.averageResponseTime.toFixed(0)} min
              </Text>
            </View>
          </View>

          {/* Recent Topics */}
          {stats.recentTopics.length > 0 && (
            <View>
              <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Trending Topics
              </Text>
              <View className="flex-row flex-wrap">
                {stats.recentTopics.map((topic, index) => (
                  <View 
                    key={index}
                    className="bg-blue-100 dark:bg-blue-900/30 rounded-full px-3 py-1 mr-2 mb-2"
                  >
                    <Text className="text-xs text-blue-600 dark:text-blue-400">
                      {topic}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* View Details Button */}
          {onViewDetails && (
            <TouchableOpacity
              onPress={onViewDetails}
              className="bg-blue-500 rounded-lg py-2 mt-3"
            >
              <Text className="text-white text-center font-medium">
                View Full Analytics
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}