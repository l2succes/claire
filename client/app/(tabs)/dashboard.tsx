import { View, Text, FlatList, RefreshControl, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, MessageCircle } from 'lucide-react-native';
// import { useRouter } from 'expo-router'; // Will be used for navigation
import { MessageCard } from '../../components/MessageCard';
import { supabase } from '../../services/supabase';
import { useAuthStore } from '../../stores/authStore';

interface Message {
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
  whatsapp_chat_id: string;
  contact_phone?: string;
}

type FilterType = 'all' | 'unread' | 'groups' | 'ai';

export default function DashboardScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  // const router = useRouter(); // Will be used for navigation to chat details
  const user = useAuthStore((state) => state.user);

  // Fetch messages with pagination
  const fetchMessages = useCallback(async (pageNum: number = 0, append: boolean = false) => {
    if (!user?.id) return;

    const pageSize = 20;
    const from = pageNum * pageSize;
    const to = from + pageSize - 1;

    try {
      // Get latest messages grouped by chat
      const { data, error, count } = await supabase
        .from('messages')
        .select(`
          id,
          content,
          timestamp,
          from_me,
          is_group,
          status,
          whatsapp_chat_id,
          whatsapp_message_id,
          contact_phone,
          contact_name,
          ai_responses (
            id,
            confidence_score
          )
        `, { count: 'exact' })
        .eq('user_id', user.id)
        .order('timestamp', { ascending: false })
        .range(from, to);

      if (error) throw error;

      // Group messages by chat and get latest
      const chatMap = new Map<string, Message>();
      
      (data || []).forEach((msg: any) => {
        const chatId = msg.whatsapp_chat_id;
        
        if (!chatMap.has(chatId) || new Date(msg.timestamp) > new Date(chatMap.get(chatId)!.timestamp)) {
          chatMap.set(chatId, {
            id: msg.id,
            contact_name: msg.contact_name,
            chat_name: msg.is_group ? msg.whatsapp_chat_id.split('@')[0] : msg.contact_name,
            content: msg.content,
            timestamp: msg.timestamp,
            from_me: msg.from_me,
            is_group: msg.is_group,
            status: msg.status,
            whatsapp_chat_id: chatId,
            contact_phone: msg.contact_phone,
            has_ai_response: msg.ai_responses?.length > 0,
            unread_count: 0, // TODO: Calculate from unread messages
          });
        }
      });

      const latestMessages = Array.from(chatMap.values())
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      if (append) {
        setMessages(prev => [...prev, ...latestMessages]);
      } else {
        setMessages(latestMessages);
      }

      // Check if there are more messages
      setHasMore(count ? to < count - 1 : false);
      setPage(pageNum);
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [user?.id]);

  // Set up real-time subscription
  useEffect(() => {
    if (!user?.id) return;

    fetchMessages();

    // Subscribe to new messages
    const subscription = supabase
      .channel('messages')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          // Refresh messages when new one arrives
          fetchMessages();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [user?.id, fetchMessages]);

  // Filter messages
  const filteredMessages = useMemo(() => {
    let filtered = messages;

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(msg => 
        msg.contact_name?.toLowerCase().includes(query) ||
        msg.chat_name?.toLowerCase().includes(query) ||
        msg.content.toLowerCase().includes(query) ||
        msg.contact_phone?.includes(query)
      );
    }

    // Apply type filter
    switch (activeFilter) {
      case 'unread':
        filtered = filtered.filter(msg => msg.unread_count && msg.unread_count > 0);
        break;
      case 'groups':
        filtered = filtered.filter(msg => msg.is_group);
        break;
      case 'ai':
        filtered = filtered.filter(msg => msg.has_ai_response);
        break;
    }

    return filtered;
  }, [messages, searchQuery, activeFilter]);

  const handleMessagePress = (message: Message) => {
    // Navigate to chat detail screen (to be implemented)
    console.log('Navigate to chat:', message.whatsapp_chat_id);
  };

  const handleMessageLongPress = (message: Message) => {
    // Show message options (archive, delete, etc.)
    console.log('Show options for:', message.id);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    setPage(0);
    await fetchMessages(0, false);
  };

  const loadMore = async () => {
    if (!hasMore || loadingMore) return;
    
    setLoadingMore(true);
    await fetchMessages(page + 1, true);
  };

  const FilterPill = ({ type, label }: { type: FilterType; label: string }) => (
    <TouchableOpacity
      onPress={() => setActiveFilter(type)}
      className={`px-3 py-1.5 rounded-full mr-2 ${
        activeFilter === type 
          ? 'bg-green-500' 
          : 'bg-gray-200 dark:bg-gray-700'
      }`}
    >
      <Text className={`text-sm font-medium ${
        activeFilter === type 
          ? 'text-white' 
          : 'text-gray-700 dark:text-gray-300'
      }`}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50 dark:bg-gray-900">
        <ActivityIndicator size="large" color="#10b981" />
        <Text className="mt-2 text-gray-600 dark:text-gray-400">Loading messages...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50 dark:bg-gray-900">
      {/* Search Bar */}
      <View className="bg-white dark:bg-gray-800 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <View className="flex-row items-center bg-gray-100 dark:bg-gray-700 rounded-lg px-3 py-2">
          <Search size={20} color="#6b7280" />
          <TextInput
            className="flex-1 ml-2 text-gray-900 dark:text-white"
            placeholder="Search messages..."
            placeholderTextColor="#6b7280"
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
          />
        </View>
        
        {/* Filter Pills */}
        <View className="flex-row mt-3">
          <FilterPill type="all" label="All" />
          <FilterPill type="unread" label="Unread" />
          <FilterPill type="groups" label="Groups" />
          <FilterPill type="ai" label="AI Suggestions" />
        </View>
      </View>

      {/* Messages List */}
      <FlatList
        data={filteredMessages}
        renderItem={({ item }) => (
          <MessageCard
            message={item}
            onPress={() => handleMessagePress(item)}
            onLongPress={() => handleMessageLongPress(item)}
          />
        )}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            tintColor="#10b981"
          />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        contentContainerStyle={filteredMessages.length === 0 ? { flex: 1 } : undefined}
        ListFooterComponent={
          loadingMore ? (
            <View className="py-4">
              <ActivityIndicator size="small" color="#10b981" />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center py-20">
            <MessageCircle size={48} color="#9ca3af" />
            <Text className="text-gray-500 dark:text-gray-400 mt-4 text-center">
              {searchQuery 
                ? 'No messages found matching your search' 
                : activeFilter !== 'all'
                  ? `No ${activeFilter} messages`
                  : 'No messages yet'}
            </Text>
            {!searchQuery && activeFilter === 'all' && (
              <Text className="text-gray-400 dark:text-gray-500 mt-2 text-center px-8">
                Connect your WhatsApp account to start receiving messages
              </Text>
            )}
          </View>
        }
      />
    </View>
  );
}