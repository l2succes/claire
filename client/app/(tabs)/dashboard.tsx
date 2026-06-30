import {
  View,
  Text,
  FlatList,
  RefreshControl,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Modal,
} from 'react-native';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, MessageCircle } from 'lucide-react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { MessageCard } from '../../components/MessageCard';
import { PlatformBadge } from '../../components/PlatformIcon';
import { MorningBrief } from '../../components/MorningBrief';
import { UrgentCard, UrgentMessage } from '../../components/UrgentCard';
import { supabase } from '../../services/supabase';
import { API_BASE_URL } from '../../services/platforms';
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
  has_open_promise?: boolean;
  chat_id: string;
  contact_phone?: string;
  platform?: Platform;
  snoozed_until?: string | null;
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

export default function DashboardScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [platformFilter, setPlatformFilter] = useState<PlatformFilterType>('all');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  // chat_id -> true for chats that have at least one open promise
  const [openPromiseChatIds, setOpenPromiseChatIds] = useState<Set<string>>(new Set());
  // Morning brief + urgent messages from /ai/morning-brief
  const [briefText, setBriefText] = useState<string | null>(null);
  const [urgentMessages, setUrgentMessages] = useState<UrgentMessage[]>([]);
  // Snooze: message currently being snoozed (shows modal picker)
  const [snoozeTarget, setSnoozeTarget] = useState<Message | null>(null);
  // Locally snoozed message IDs: hide from inbox immediately (optimistic)
  const [locallySnoozeIds, setLocallySnoozeIds] = useState<Set<string>>(new Set());

  const user = useAuthStore((state) => state.user);
  const { initialize, isInitialized } = usePlatformStore();
  const hasConnection = useHasAnyConnection();

  useEffect(() => {
    if (!isInitialized) initialize();
  }, [initialize, isInitialized]);

  const fetchOpenPromises = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('promises')
      .select('chat_id')
      .eq('user_id', user.id)
      .in('status', ['pending', 'open'])
      .not('chat_id', 'is', null);
    if (data) {
      setOpenPromiseChatIds(new Set(data.map((r: any) => r.chat_id as string)));
    }
  }, [user?.id]);

  useEffect(() => {
    fetchOpenPromises();
  }, [fetchOpenPromises]);

  const fetchMorningBrief = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${API_BASE_URL}/ai/morning-brief`, {
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {},
      });
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && json.data) {
        setBriefText(json.data.brief_text ?? null);
        setUrgentMessages(json.data.urgent_messages ?? []);
      }
    } catch {
      // Non-critical — silently ignore
    }
  }, [user?.id]);

  useEffect(() => {
    fetchMorningBrief();
  }, [fetchMorningBrief]);

  const handleSnooze = useCallback(async (msg: Message, snoozeMinutes: number) => {
    setSnoozeTarget(null);
    // Optimistic: hide immediately
    setLocallySnoozeIds((prev) => new Set([...prev, msg.id]));

    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch(`${API_BASE_URL}/messages/${msg.id}/snooze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ snooze_minutes: snoozeMinutes }),
      });
    } catch {
      // If the server call fails, un-hide the message
      setLocallySnoozeIds((prev) => {
        const next = new Set(prev);
        next.delete(msg.id);
        return next;
      });
    }
  }, []);

  const fetchMessages = useCallback(async (pageNum = 0, append = false) => {
    if (!user?.id) return;
    const pageSize = 20;
    const from = pageNum * pageSize;
    const to = from + pageSize - 1;
    const now = new Date().toISOString();
    try {
      const { data, error, count } = await supabase
        .from('messages')
        .select(
          `id, content, timestamp, from_me, is_group, status, platform,
           chat_id, platform_message_id, contact_phone, contact_name,
           snoozed_until,
           chats (name, platform_chat_id),
           ai_suggestions (id, confidence)`,
          { count: 'exact' }
        )
        .eq('user_id', user.id)
        .or(`snoozed_until.is.null,snoozed_until.lte.${now}`)
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
            snoozed_until: msg.snoozed_until ?? null,
          });
        }
      });

      const sorted = Array.from(chatMap.values()).sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

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
    const now = new Date();
    // Exclude messages that are currently snoozed (optimistic local OR server-side)
    let filtered = messages.filter((m) => {
      if (locallySnoozeIds.has(m.id)) return false;
      if (m.snoozed_until && new Date(m.snoozed_until) > now) return false;
      return true;
    });
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
  }, [messages, searchQuery, activeFilter, platformFilter, locallySnoozeIds]);

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
              message={{ ...item, has_open_promise: openPromiseChatIds.has(item.chat_id) }}
              onPress={() => navigateToChat(item)}
              onLongPress={() => setSnoozeTarget(item)}
            />
          </Animated.View>
        )}
        keyExtractor={(item) => item.conversation_key}
        testID="messages-list"
        ListHeaderComponent={
          <>
            {briefText ? (
              <View testID="morning-brief-container" className="pt-4">
                <MorningBrief text={briefText} />
              </View>
            ) : null}
            {urgentMessages.length > 0 ? (
              <View testID="urgent-cards-container" className="gap-3 pb-3">
                {urgentMessages.map((msg) => (
                  <UrgentCard
                    key={msg.id}
                    message={msg}
                    onPress={() =>
                      router.push({
                        pathname: '/chat/[chatId]',
                        params: {
                          chatId: msg.chat_id,
                          contact_name: msg.contact_name || '',
                          chat_name: msg.chat_name || '',
                          platform: msg.platform || '',
                          is_group: msg.is_group ? '1' : '0',
                        },
                      })
                    }
                    onQuickReply={(text, chatId) => {
                      router.push({
                        pathname: '/chat/[chatId]',
                        params: {
                          chatId,
                          prefill: text,
                        },
                      });
                    }}
                  />
                ))}
              </View>
            ) : null}
          </>
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              setPage(0);
              fetchMessages(0, false);
              fetchMorningBrief();
            }}
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

      {/* Snooze picker modal */}
      <Modal
        visible={!!snoozeTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setSnoozeTarget(null)}
        testID="snooze-modal"
      >
        <View
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}
          testID="snooze-modal-overlay"
        >
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 16 }}>
              Snooze until…
            </Text>
            {[
              { label: 'Later today (3 hours)', minutes: 180, testID: 'snooze-option-3h' },
              { label: 'Tonight (8 pm)', minutes: Math.max(30, (20 - new Date().getHours()) * 60), testID: 'snooze-option-tonight' },
              { label: 'Tomorrow morning', minutes: 60 * (24 - new Date().getHours() + 8), testID: 'snooze-option-tomorrow' },
              { label: 'Next week', minutes: 60 * 24 * 7, testID: 'snooze-option-week' },
            ].map((opt) => (
              <TouchableOpacity
                key={opt.testID}
                testID={opt.testID}
                onPress={() => snoozeTarget && handleSnooze(snoozeTarget, opt.minutes)}
                style={{
                  paddingVertical: 14,
                  borderBottomWidth: 1,
                  borderBottomColor: '#f3f4f6',
                }}
              >
                <Text style={{ fontSize: 15, color: '#374151' }}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              testID="snooze-cancel"
              onPress={() => setSnoozeTarget(null)}
              style={{ paddingVertical: 14, alignItems: 'center' }}
            >
              <Text style={{ fontSize: 15, color: '#6b7280' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
