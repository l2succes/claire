import {
  View, Text, TouchableOpacity, ActivityIndicator,
  FlatList, TextInput, KeyboardAvoidingView, Platform as RNPlatform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, SendHorizonal } from 'lucide-react-native';
import { supabase } from '../../services/supabase';
import { platformsApi } from '../../services/platforms';
import { useAuthStore } from '../../stores/authStore';
import { usePlatformStore } from '../../stores/platformStore';
import { PlatformBadge } from '../../components/PlatformIcon';
import { Platform } from '../../types/platform';

interface ChatMessage {
  id: string;
  content: string;
  timestamp: string;
  from_me: boolean;
  contact_name?: string;
  contact_phone?: string;
}

export default function ChatScreen() {
  const { chatId, contact_name, chat_name, platform, is_group } = useLocalSearchParams<{
    chatId: string;
    contact_name: string;
    chat_name: string;
    platform: string;
    is_group: string;
  }>();

  const user = useAuthStore((state) => state.user);
  const connectedSessions = usePlatformStore((state) => state.connectedSessions);
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [inputText, setInputText] = useState('');
  const platformChatIdRef = useRef<string | null>(null);
  const listRef = useRef<FlatList>(null);

  const displayName = is_group === '1'
    ? (chat_name || contact_name || 'Group')
    : (contact_name || chat_name || 'Unknown');

  const fetchMessages = useCallback(async () => {
    if (!user?.id || !chatId) {
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('id, content, timestamp, from_me, contact_name, contact_phone')
        .eq('chat_id', chatId)
        .eq('user_id', user.id)
        .order('timestamp', { ascending: true })
        .limit(100);
      if (error) throw error;
      setMessages(data || []);
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id, chatId]);

  const fetchChatInfo = useCallback(async () => {
    if (!chatId) return;
    const { data } = await supabase
      .from('chats')
      .select('platform_chat_id')
      .eq('id', chatId)
      .single();
    if (data?.platform_chat_id) {
      platformChatIdRef.current = data.platform_chat_id;
    }
  }, [chatId]);

  useEffect(() => {
    fetchMessages();
    fetchChatInfo();

    const subscription = supabase
      .channel(`chat-${chatId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
        (payload) => {
          setMessages((prev) => {
            // Avoid duplicates (e.g. optimistic message already in list)
            if (prev.some((m) => m.id === (payload.new as ChatMessage).id)) return prev;
            return [...prev, payload.new as ChatMessage];
          });
          setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
        }
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
        () => fetchMessages()
      )
      .subscribe((status, err) => {
        console.log('[Realtime] Chat subscription status:', status, err ?? '');
      });

    return () => { supabase.removeChannel(subscription); };
  }, [chatId, fetchMessages, fetchChatInfo]);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || !platform) return;

    const platformChatId = platformChatIdRef.current;
    if (!platformChatId) return;

    const session = connectedSessions.find(
      (s) => s.platform === (platform as Platform) && s.status === 'connected'
    );
    if (!session) return;

    // Optimistic update
    const optimistic: ChatMessage = {
      id: `optimistic-${Date.now()}`,
      content: text,
      timestamp: new Date().toISOString(),
      from_me: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    setInputText('');
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);

    setSending(true);
    try {
      await platformsApi.sendMessage(platform as Platform, session.id, platformChatId, text);
    } catch (err) {
      console.error('Send failed:', err);
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setInputText(text);
    } finally {
      setSending(false);
    }
  }, [inputText, platform, connectedSessions]);

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isMe = item.from_me;
    return (
      <View style={{
        flexDirection: 'row',
        justifyContent: isMe ? 'flex-end' : 'flex-start',
        paddingHorizontal: 12,
        paddingVertical: 3,
      }}>
        <View style={{
          maxWidth: '78%',
          backgroundColor: isMe ? '#10b981' : '#f3f4f6',
          borderRadius: 18,
          borderBottomRightRadius: isMe ? 4 : 18,
          borderBottomLeftRadius: isMe ? 18 : 4,
          paddingHorizontal: 14,
          paddingVertical: 8,
        }}>
          {!isMe && is_group === '1' && item.contact_name && (
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#6b7280', marginBottom: 2 }}>
              {item.contact_name}
            </Text>
          )}
          <Text style={{ fontSize: 15, color: isMe ? '#ffffff' : '#111827', lineHeight: 20 }}>
            {item.content}
          </Text>
          <Text style={{ fontSize: 11, color: isMe ? 'rgba(255,255,255,0.7)' : '#9ca3af', marginTop: 3, textAlign: isMe ? 'right' : 'left' }}>
            {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#ffffff' }} edges={['top']}>
      {/* Header */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#e5e7eb',
      }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 8, padding: 4 }}>
          <ChevronLeft size={24} color="#111827" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: '#111827' }} numberOfLines={1}>
            {displayName}
          </Text>
        </View>
        {platform ? <PlatformBadge platform={platform as Platform} size="sm" /> : null}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={RNPlatform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#10b981" />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingVertical: 8 }}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={{ flex: 1, alignItems: 'center', paddingTop: 60 }}>
                <Text style={{ color: '#9ca3af', fontSize: 15 }}>No messages yet</Text>
              </View>
            }
          />
        )}

        {/* Input bar */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          paddingHorizontal: 12,
          paddingVertical: 8,
          paddingBottom: Math.max(insets.bottom, 8),
          borderTopWidth: 1,
          borderTopColor: '#e5e7eb',
          backgroundColor: '#ffffff',
        }}>
          <TextInput
            style={{
              flex: 1,
              minHeight: 40,
              maxHeight: 120,
              backgroundColor: '#f3f4f6',
              borderRadius: 20,
              paddingHorizontal: 16,
              paddingVertical: 10,
              fontSize: 15,
              color: '#111827',
              marginRight: 8,
            }}
            placeholder="Message..."
            placeholderTextColor="#9ca3af"
            value={inputText}
            onChangeText={setInputText}
            multiline
            returnKeyType="default"
            onSubmitEditing={handleSend}
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={!inputText.trim() || sending}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: inputText.trim() && !sending ? '#10b981' : '#e5e7eb',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <SendHorizonal size={18} color={inputText.trim() && !sending ? '#ffffff' : '#9ca3af'} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
