import {
  View,
  Text,
  FlatList,
  RefreshControl,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, MessageCircle } from 'lucide-react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { MessageCard } from '../../components/MessageCard';
import { PlatformBadge } from '../../components/PlatformIcon';
import { supabase } from '../../services/supabase';
import { useAuthStore } from '../../stores/authStore';
import { usePlatformStore, useHasAnyConnection } from '../../stores/platformStore';
import { Platform, PLATFORM_DISPLAY } from '../../types/platform';

interface Message {
  id: string;
  conversation_key: string;
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
  chat_id: string;
  contact_phone?: string;
  platform?: Platform;
}

type FilterType = 'all' | 'unread' | 'groups' | 'ai';
type PlatformFilterType = Platform | 'all';
const MESSAGE_ROW_LAYOUT = LinearTransition.springify().damping(18).stiffness(220);
const MESSAGE_ROW_ENTERING = FadeInDown.duration(180);

function getConversationKey(chatId: string, platform?: Platform) {
  return `${platform || Platform.WHATSAPP}:${chatId}`;
}

function FilterPill({
  type,
  label,
  activeFilter,
  onPress,
}: {
  type: FilterType;
  label: string;
  activeFilter: FilterType;
  onPress: () => void;
}) {
  const isActive = activeFilter === type;
  return (
    <TouchableOpacity
      onPress={onPress}
      className={`px-3 py-1.5 rounded-full mr-2 ${isActive ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700'}`}
    >
      <Text className={`text-sm font-medium ${isActive ? 'text-white' : 'text-gray-700 dark:text-gray-300'}`}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function PlatformFilterPill({
  platform,
  label,
  platformFilter,
  onPress,
}: {
  platform: PlatformFilterType;
  label: string;
  platformFilter: PlatformFilterType;
  onPress: () => void;
}) {
  const isActive = platformFilter === platform;
  return (
    <TouchableOpacity
      onPress={onPress}
      className={`flex-row items-center px-3 py-1.5 rounded-full mr-2 ${isActive ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700'}`}
    >
      {platform !== 'all' && (
        <PlatformBadge platform={platform as Platform} size={14} className="mr-1" />
      )}
      <Text className={`text-sm font-medium ${isActive ? 'text-white' : 'text-gray-700 dark:text-gray-300'}`}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function MessagesScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [platformFilter, setPlatformFilter] = useState<PlatformFilterType>('all');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const user = useAuthStore((state) => state.user);
  const { initialize, isInitialized } = usePlatformStore();
  const hasConnection = useHasAnyConnection();

  useEffect(() => {
    if (!isInitialized) initialize();
  }, [initialize, isInitialized]);

  const fetchMessages = useCallback(async (pageNum = 0, append = false) => {
    if (!user?.id) return;
    const pageSize = 20;
    const from = pageNum * pageSize;
    const to = from + pageSize - 1;
    try {
      const { data, error, count } = await supabase
        .from('messages')
        .select(
          `id, content, timestamp, from_me, is_group, status, platform,
           chat_id, platform_message_id, contact_phone, contact_name,
           chats (name, platform_chat_id),
           ai_suggestions (id, confidence)`,
          { count: 'exact' }
        )
        .eq('user_id', user.id)
        .order('timestamp', { ascending: false })
        .range(from, to);

      if (error) throw error;

      const chatMap = new Map<string, Message>();
      (data || []).forEach((msg: any) => {
        const chatId = msg.chat_id || msg.id;
        const platform = msg.platform || Platform.WHATSAPP;
        const conversationKey = getConversationKey(chatId, platform);
        if (!chatMap.has(conversationKey) || new Date(msg.timestamp) > new Date(chatMap.get(conversationKey)!.timestamp)) {
          chatMap.set(conversationKey, {
            id: msg.id,
            conversation_key: conversationKey,
            contact_name: msg.contact_name,
            chat_name: msg.chats?.name || (!msg.from_me ? msg.contact_name : null),
            content: msg.content,
            timestamp: msg.timestamp,
            from_me: msg.from_me,
            is_group: msg.is_group,
            status: msg.status,
            chat_id: chatId,
            contact_phone: msg.contact_phone,
            has_ai_response: msg.ai_suggestions?.length > 0,
            unread_count: 0,
            platform,
          });
        }
      });

      const sorted = Array.from(chatMap.values()).sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      // Deduplicate by platform + name/phone/id — same conversation may have multiple
      // DB entries with different chat_ids (e.g. after a DB migration or backfill).
      const seen = new Set<string>();
      const latest = sorted.filter((msg) => {
        const key = `${msg.platform}:${msg.chat_name || msg.contact_phone || msg.chat_id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      if (append) {
        setMessages((prev) => {
          const combined = [...prev, ...latest];
          const seenConversationKeys = new Set<string>();
          return combined.filter((m) => {
            if (seenConversationKeys.has(m.conversation_key)) return false;
            seenConversationKeys.add(m.conversation_key);
            return true;
          });
        });
      } else {
        setMessages(latest);
      }

      setHasMore(count ? to < count - 1 : false);
      setPage(pageNum);
    } catch (e) {
      console.error('Error fetching messages:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    fetchMessages();
    const sub = supabase
      .channel(`messages-tab-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `user_id=eq.${user.id}` }, (payload) => {
        const row = payload.new as any;
        const platform = row.platform || Platform.WHATSAPP;
        const conversationKey = getConversationKey(row.chat_id, platform);
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.conversation_key === conversationKey);
          if (idx >= 0) {
            const updated: Message = {
              ...prev[idx],
              id: row.id,
              conversation_key: conversationKey,
              content: row.content,
              timestamp: row.timestamp,
              from_me: row.from_me,
              is_group: row.is_group ?? prev[idx].is_group,
              contact_name: row.contact_name || prev[idx].contact_name,
              contact_phone: row.contact_phone || prev[idx].contact_phone,
              platform,
            };
            return [updated, ...prev.filter((_, i) => i !== idx)];
          }
          fetchMessages();
          return prev;
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `user_id=eq.${user.id}` }, () => fetchMessages())
      .subscribe();
    return () => { sub.unsubscribe(); };
  }, [user?.id, fetchMessages]);

  useEffect(() => {
    if (!user?.id) return;
    const interval = setInterval(() => fetchMessages(), 15_000);
    return () => clearInterval(interval);
  }, [user?.id, fetchMessages]);

  const filteredMessages = useMemo(() => {
    let filtered = messages;
    if (platformFilter !== 'all') filtered = filtered.filter((m) => m.platform === platformFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (m) =>
          m.contact_name?.toLowerCase().includes(q) ||
          m.chat_name?.toLowerCase().includes(q) ||
          m.content.toLowerCase().includes(q) ||
          m.contact_phone?.includes(q)
      );
    }
    switch (activeFilter) {
      case 'unread': filtered = filtered.filter((m) => m.unread_count && m.unread_count > 0); break;
      case 'groups': filtered = filtered.filter((m) => m.is_group); break;
      case 'ai':     filtered = filtered.filter((m) => m.has_ai_response); break;
    }
    return filtered;
  }, [messages, searchQuery, activeFilter, platformFilter]);

  const navigateToChat = (msg: Message) => {
    router.push({
      pathname: '/chat/[chatId]',
      params: {
        chatId: msg.chat_id,
        contact_name: msg.contact_name || '',
        chat_name: msg.chat_name || '',
        platform: msg.platform || '',
        is_group: msg.is_group ? '1' : '0',
      },
    });
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50 dark:bg-gray-900" testID="messages-loading">
        <ActivityIndicator size="large" color="#6366f1" />
        <Text className="mt-2 text-gray-500 dark:text-gray-400">Loading messages...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50 dark:bg-gray-900" testID="messages-screen">
      {/* Sticky filter bar — lives outside FlatList to avoid key conflicts */}
      <View className="bg-white dark:bg-gray-800 px-4 pt-3 pb-2 border-b border-gray-100 dark:border-gray-700">
        <View className="flex-row items-center bg-gray-100 dark:bg-gray-700 rounded-xl px-3 py-2 mb-3">
          <Search size={18} color="#6b7280" />
          <TextInput
            className="flex-1 ml-2 text-gray-900 dark:text-white"
            placeholder="Search messages..."
            placeholderTextColor="#6b7280"
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            testID="messages-search-input"
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2" contentContainerStyle={{ gap: 6 }}>
          <PlatformFilterPill platform="all" label="All" platformFilter={platformFilter} onPress={() => setPlatformFilter('all')} />
          <PlatformFilterPill platform={Platform.WHATSAPP} label="WhatsApp" platformFilter={platformFilter} onPress={() => setPlatformFilter(Platform.WHATSAPP)} />
          <PlatformFilterPill platform={Platform.TELEGRAM} label="Telegram" platformFilter={platformFilter} onPress={() => setPlatformFilter(Platform.TELEGRAM)} />
          <PlatformFilterPill platform={Platform.INSTAGRAM} label="Instagram" platformFilter={platformFilter} onPress={() => setPlatformFilter(Platform.INSTAGRAM)} />
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          <FilterPill type="all" label="All" activeFilter={activeFilter} onPress={() => setActiveFilter('all')} />
          <FilterPill type="unread" label="Unread" activeFilter={activeFilter} onPress={() => setActiveFilter('unread')} />
          <FilterPill type="groups" label="Groups" activeFilter={activeFilter} onPress={() => setActiveFilter('groups')} />
          <FilterPill type="ai" label="AI Suggestions" activeFilter={activeFilter} onPress={() => setActiveFilter('ai')} />
        </ScrollView>
      </View>
      <FlatList
        data={filteredMessages}
        renderItem={({ item }) => (
          <Animated.View entering={MESSAGE_ROW_ENTERING} layout={MESSAGE_ROW_LAYOUT}>
            <MessageCard
              message={item}
              onPress={() => navigateToChat(item)}
              onLongPress={() => console.log('options:', item.id)}
            />
          </Animated.View>
        )}
        keyExtractor={(item) => item.conversation_key}
        testID="messages-list"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); setPage(0); fetchMessages(0, false); }}
            tintColor="#6366f1"
          />
        }
        onEndReached={() => { if (hasMore && !loadingMore) { setLoadingMore(true); fetchMessages(page + 1, true); } }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          loadingMore ? (
            <View className="py-4">
              <ActivityIndicator size="small" color="#6366f1" />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View className="items-center py-16 px-8" testID="messages-empty">
            <MessageCircle size={40} color="#9ca3af" />
            <Text className="text-gray-500 dark:text-gray-400 mt-3 text-center text-sm">
              {searchQuery
                ? 'No messages matching your search'
                : platformFilter !== 'all'
                  ? `No ${PLATFORM_DISPLAY[platformFilter as Platform].name} messages`
                  : activeFilter !== 'all'
                    ? `No ${activeFilter} messages`
                    : 'No messages yet'}
            </Text>
            {!searchQuery && activeFilter === 'all' && platformFilter === 'all' && !hasConnection && (
              <TouchableOpacity
                onPress={() => router.push('/(auth)/login')}
                className="mt-4 bg-indigo-600 px-6 py-2 rounded-full"
              >
                <Text className="text-white font-semibold text-sm">Connect Platform</Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />
    </View>
  );
}
