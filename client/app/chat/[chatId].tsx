import {
  View, Text, ActivityIndicator, Pressable,
  FlatList, KeyboardAvoidingView, Platform as RNPlatform,
  Image,
} from 'react-native';
import { ImageIcon, Volume2, Video, FileText, AlertCircle, Link2, MoreHorizontal, Sparkles, X, ChevronLeft } from 'lucide-react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react';
import { supabase } from '../../services/supabase';
import { platformsApi, API_BASE_URL } from '../../services/platforms';
import { useAuthStore } from '../../stores/authStore';
import { usePlatformStore } from '../../stores/platformStore';
import { useChatPreferencesStore } from '../../stores/chatPreferencesStore';
import { ResponseSuggestion } from '../../components/ResponseSuggestion';
import { ChatComposer } from '../../components/claire/composer';
import { ChatSkeleton } from '../../components/claire/skeleton';
import { useConversationSettingsStore } from '../../stores/conversationSettingsStore';
import { GroupChatSummary } from '../../components/GroupChatSummary';
import { Platform } from '../../types/platform';
import { PlatformName } from '../../components/PlatformIcon';
import { setActiveNotificationChat, syncNotificationBadge, updateNotificationPresence } from '../../services/notifications';
import { colors, mobileType, radius, space } from '@claire/design-system';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { MobileAvatar, MobileIconButton } from '../../components/mobile/claire-mobile';
import { cacheTimeline, cachedTimeline, usesNativeMobileCache } from '../../services/mobile-cache';

interface ChatMessage {
  id: string;
  content: string;
  timestamp: string;
  from_me: boolean;
  contact_name?: string;
  contact_phone?: string;
  content_type?: string;
  media_url?: string;
  media_mime_type?: string;
  platform_message_id?: string;
}

function isLocalSend(id: string) {
  return id.startsWith('optimistic-') || id.startsWith('local-');
}

function mergeChatMessage(prev: ChatMessage[], incoming: ChatMessage): ChatMessage[] {
  if (prev.some((message) => message.id === incoming.id)) {
    return prev.map((message) => message.id === incoming.id ? { ...message, ...incoming } : message);
  }
  if (incoming.from_me) {
    const localIndex = prev.findIndex((message) => isLocalSend(message.id) && message.content === incoming.content);
    if (localIndex >= 0) {
      const next = [...prev];
      next[localIndex] = { ...prev[localIndex], ...incoming, id: incoming.id };
      return next;
    }
  }
  return [...prev, incoming];
}

function keepPendingSends(serverMessages: ChatMessage[], current: ChatMessage[]) {
  const pending = current.filter((message) => (
    isLocalSend(message.id)
    && !serverMessages.some((row) => row.id === message.id || (row.from_me && row.content === message.content))
  ));
  return [...serverMessages, ...pending].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

function chatMessageFromSend(payload: unknown, fallback: ChatMessage): ChatMessage {
  if (!payload || typeof payload !== 'object') return fallback;
  const raw = payload as Record<string, unknown>;
  const platformMessageId = typeof raw.platformMessageId === 'string'
    ? raw.platformMessageId
    : typeof raw.platform_message_id === 'string'
      ? raw.platform_message_id
      : undefined;
  const timestampValue = raw.timestamp;
  const timestamp = typeof timestampValue === 'string'
    ? new Date(timestampValue).toISOString()
    : timestampValue instanceof Date
      ? timestampValue.toISOString()
      : fallback.timestamp;
  return {
    ...fallback,
    id: fallback.id,
    content: typeof raw.content === 'string' ? raw.content : fallback.content,
    timestamp,
    from_me: true,
    ...(platformMessageId ? { platform_message_id: platformMessageId } : {}),
  };
}

function InjectedBubble({
  animate,
  style,
  testID,
  children,
}: {
  animate: boolean;
  style: object;
  testID?: string;
  children: ReactNode;
}) {
  const progress = useSharedValue(animate ? 0 : 1);
  useEffect(() => {
    if (!animate) return;
    progress.value = withSpring(1, { damping: 14, stiffness: 240, mass: 0.62 });
  }, [animate, progress]);
  const motion = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: (1 - progress.value) * 16 },
      { scale: 0.82 + 0.18 * progress.value },
    ],
  }));
  return <Animated.View testID={testID} style={[style, motion]}>{children}</Animated.View>;
}

// An installed development client can lag behind the JavaScript bundle after a
// new Expo native module is added. Keep the chat route loadable in that window:
// current builds play video; older builds retain a clear attachment fallback.
let expoVideoModule: typeof import('expo-video') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  expoVideoModule = require('expo-video') as typeof import('expo-video');
} catch {
  expoVideoModule = null;
}

function normalizeMediaUrl(value?: string | null): string | null {
  if (!value) return null;
  if (value.startsWith('/media/')) return `${API_BASE_URL}${value}`;
  const mxc = value.match(/^mxc:\/\/([^/]+)\/(.+)$/)
    || value.match(/\/_matrix\/(?:client\/v1\/media|media\/v3)\/(?:thumbnail|download)\/([^/]+)\/([^?]+)/);
  if (mxc) return `${API_BASE_URL}/media/${encodeURIComponent(mxc[1])}/${encodeURIComponent(mxc[2])}`;
  return value;
}

function MediaImage({ uri, messageId }: { uri: string; messageId: string }) {
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  if (failed) {
    return (
      <View testID={`media-image-fallback-${messageId}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12 }}>
        <AlertCircle size={16} color={colors.neutral[400]} />
        <Text style={{ ...mobileType.bodySmall, color: colors.neutral[400] }}>Media unavailable</Text>
      </View>
    );
  }
  return (
    <View testID={`media-image-${messageId}`}>
      {loading && <ActivityIndicator testID={`media-image-loading-${messageId}`} size="small" color={colors.neutral[400]} />}
      <Image
        source={{ uri }}
        style={{ width: 220, height: 160, borderRadius: radius.control, marginBottom: 4, opacity: loading ? 0 : 1 }}
        resizeMode="cover"
        onLoad={() => setLoading(false)}
        onError={() => { setLoading(false); setFailed(true); }}
        testID={`media-image-img-${messageId}`}
      />
    </View>
  );
}

function MediaVideo({ uri, messageId }: { uri: string; messageId: string }) {
  const video = expoVideoModule;
  if (!video) {
    return (
      <View testID={`media-video-fallback-${messageId}`} style={{ width: 250, minHeight: 96, borderRadius: radius.control, marginBottom: 4, padding: space[3], gap: 6, backgroundColor: colors.neutral[100], alignItems: 'center', justifyContent: 'center' }}>
        <Video size={22} color={colors.neutral[600]} />
        <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>Video attachment</Text>
        <Text numberOfLines={1} style={{ ...mobileType.label, color: colors.focus }}>Update Claire to play this video</Text>
      </View>
    );
  }
  const player = video.useVideoPlayer(uri, (instance) => {
    instance.loop = false;
  });
  const VideoView = video.VideoView;
  return (
    <VideoView
      testID={`media-video-player-${messageId}`}
      player={player}
      nativeControls
      contentFit="contain"
      playsInline
      style={{ width: 250, height: 180, borderRadius: radius.control, marginBottom: 4, backgroundColor: colors.ink }}
    />
  );
}

export default function ChatScreen() {
  const { chatId, contact_name, chat_name, platform, is_group, highlightMessageId, draft } = useLocalSearchParams<{
    chatId: string;
    contact_name: string;
    chat_name: string;
    platform: string;
    is_group: string;
    highlightMessageId?: string;
    draft?: string;
  }>();

  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.token);
  const connectedSessions = usePlatformStore((state) => state.connectedSessions);
  const {
    settings: convSettings,
    fetchSettings: fetchConvSettings,
    dismissCard,
  } = useConversationSettingsStore();
  const plusDefault = useChatPreferencesStore((state) => state.plusDefault);
  const hydrateChatPreferences = useChatPreferencesStore((state) => state.hydrate);
  const insets = useSafeAreaInsets();
  const smartCards = convSettings[chatId!]?.smartCards ?? [];
  const contactProfile = convSettings[chatId!]?.profile ?? null;
  const fetchConnectedSessions = usePlatformStore((state) => state.fetchConnectedSessions);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [suggestionRefreshKey, setSuggestionRefreshKey] = useState(0);
  const [showReplyOptions, setShowReplyOptions] = useState(false);
  const [connectionRefreshing, setConnectionRefreshing] = useState(false);
  const platformChatIdRef = useRef<string | null>(null);
  const listRef = useRef<FlatList>(null);
  const hasScrolledToHighlight = useRef(false);

  useEffect(() => {
    if (draft) setInputText(draft);
  }, [draft]);

  const displayName = is_group === '1'
    ? (chat_name || contact_name || 'Group')
    : (contact_name || chat_name || 'Unknown');
  const activeSession = connectedSessions.find(session => session.platform === (platform as Platform) && session.status === 'connected');
  const isConnected = !!activeSession;
  const contextCard = smartCards[0];
  const quickContext = contextCard?.subtitle || contextCard?.title || contactProfile?.ai_instruction || contactProfile?.relationship_context || null;
  const needsRelationshipContext = is_group !== '1' && !contactProfile?.relationship_context;
  const showQuickContext = Boolean(quickContext || needsRelationshipContext) && !showReplyOptions;

  const fetchMessages = useCallback(async () => {
    if (!user?.id || !chatId) {
      setLoading(false);
      return;
    }
    try {
      if (usesNativeMobileCache()) {
        const cached = await cachedTimeline(user.id, chatId, 200);
        if (cached.length) {
          setMessages((current) => keepPendingSends(cached as unknown as ChatMessage[], current));
          setLoading(false);
        }
      }
      const { data, error } = await supabase
        .from('messages')
        .select('id, chat_id, content, timestamp, from_me, contact_name, contact_phone, content_type, media_url, media_mime_type')
        .eq('chat_id', chatId)
        .eq('user_id', user.id)
        .order('timestamp', { ascending: false })
        .limit(100);
      if (error) throw error;
      let loadedMessages = data || [];
      // Assistant citations can reference older history than the normal chat
      // window. Fetch the cited row explicitly so it is always reachable.
      if (highlightMessageId && !loadedMessages.some(message => message.id === highlightMessageId)) {
        const { data: highlightedMessage, error: highlightError } = await supabase
          .from('messages')
          .select('id, chat_id, content, timestamp, from_me, contact_name, contact_phone, content_type, media_url, media_mime_type')
          .eq('id', highlightMessageId)
          .eq('chat_id', chatId)
          .eq('user_id', user.id)
          .maybeSingle();
        if (highlightError) throw highlightError;
        if (highlightedMessage) loadedMessages = [...loadedMessages, highlightedMessage];
      }
      const deduplicated = [...new Map(loadedMessages.map(message => [message.id, message])).values()]
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      setMessages((current) => keepPendingSends(deduplicated, current));
      if (usesNativeMobileCache()) void cacheTimeline(user.id, chatId, deduplicated).catch(() => undefined);
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id, chatId, highlightMessageId]);

  const fetchChatInfo = useCallback(async () => {
    if (!chatId) return false;
    const { data, error } = await supabase
      .from('chats')
      .select('platform_chat_id')
      .eq('id', chatId)
      .single();
    if (error) {
      console.warn('[Chat] chat configuration fetch failed', error);
      return false;
    }
    if (data?.platform_chat_id) {
      platformChatIdRef.current = data.platform_chat_id;
      return true;
    }
    return false;
  }, [chatId]);

  const refreshConnection = useCallback(async () => {
    setConnectionRefreshing(true);
    try {
      await fetchConnectedSessions();
      await fetchChatInfo();
    } finally {
      setConnectionRefreshing(false);
    }
  }, [fetchChatInfo, fetchConnectedSessions]);

  const markConversationRead = useCallback(async () => {
    if (!chatId) return;
    const session = connectedSessions.find(
      (candidate) => candidate.platform === (platform as Platform) && candidate.status === 'connected'
    );
    try {
      await platformsApi.markChatRead(chatId, session?.id);
      await syncNotificationBadge().catch(() => undefined);
    } catch (error) {
      console.warn('Failed to mark conversation read:', error);
    }
  }, [chatId, platform, connectedSessions]);

  useEffect(() => {
    if (!chatId) return;
    setActiveNotificationChat(chatId);
    if (accessToken) updateNotificationPresence(accessToken, 'foreground', chatId).catch(() => undefined);
    return () => {
      setActiveNotificationChat(undefined);
      if (accessToken) updateNotificationPresence(accessToken, 'foreground').catch(() => undefined);
    };
  }, [accessToken, chatId]);

  useEffect(() => {
    fetchMessages().then(markConversationRead);
    void refreshConnection();
    if (chatId) fetchConvSettings(chatId);

    const subscription = supabase
      .channel(`chat-${chatId}-${user?.id ?? 'anonymous'}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
        (payload) => {
          const inserted = payload.new as ChatMessage;
          if (usesNativeMobileCache() && user?.id) void cacheTimeline(user.id, chatId, [{ ...inserted, chat_id: chatId }]).catch(() => undefined);
          setMessages((prev) => mergeChatMessage(prev, inserted));
          if (!inserted.from_me) void markConversationRead();
        }
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
        (payload) => {
          const updated = payload.new as ChatMessage;
          setMessages((prev) => mergeChatMessage(prev, updated));
        }
      )
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'ai_suggestions',
        filter: user?.id ? `user_id=eq.${user.id}` : undefined,
      },
        (payload) => {
          const messageId = (payload.new as { message_id?: string } | undefined)?.message_id;
          if (messageId) setSuggestionRefreshKey((key) => key + 1);
        }
      )
      .subscribe((status, err) => {
        console.log('[Realtime] Chat subscription status:', status, err ?? '');
      });

    return () => { supabase.removeChannel(subscription); };
  }, [chatId, user?.id, fetchMessages, markConversationRead, refreshConnection]);

  useEffect(() => {
    void hydrateChatPreferences();
  }, [hydrateChatPreferences]);

  useEffect(() => {
    hasScrolledToHighlight.current = false;
  }, [highlightMessageId]);

  const listData = useMemo(() => [...messages].reverse(), [messages]);
  const lastInbound = useMemo(() => [...messages].reverse().find(message => !message.from_me), [messages]);
  const latestInjectedId = useMemo(() => (
    [...messages].reverse().find((message) => message.from_me && isLocalSend(message.id))?.id ?? null
  ), [messages]);

  useEffect(() => {
    if (!highlightMessageId || hasScrolledToHighlight.current) return;
    const index = listData.findIndex(message => message.id === highlightMessageId);
    if (index < 0) return;
    const timer = setTimeout(() => {
      listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.45 });
      hasScrolledToHighlight.current = true;
    }, 80);
    return () => clearTimeout(timer);
  }, [listData, highlightMessageId]);

  // Clear error when user starts typing
  useEffect(() => {
    if (sendError && inputText) {
      setSendError(null);
    }
  }, [inputText, sendError]);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || !platform) {
      setSendError('Unable to determine platform');
      return;
    }

    const platformChatId = platformChatIdRef.current || (await fetchChatInfo() ? platformChatIdRef.current : null);
    if (!platformChatId) {
      setSendError('Chat configuration error - please reopen this chat');
      return;
    }

    const session = connectedSessions.find(
      (s) => s.platform === (platform as Platform) && s.status === 'connected'
    );
    if (!session) {
      setSendError(`Not connected to ${platform}. Reconnect it from Connections.`);
      return;
    }

    // Clear any previous errors
    setSendError(null);

    // Optimistic update
    const optimistic: ChatMessage = {
      id: `optimistic-${Date.now()}`,
      content: text,
      timestamp: new Date().toISOString(),
      from_me: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    if (user?.id && chatId) {
      void cacheTimeline(user.id, chatId, [{ ...optimistic, chat_id: chatId }]).catch(() => undefined);
    }
    setInputText('');
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    });

    setSending(true);
    try {
      const sent = await platformsApi.sendMessage(platform as Platform, session.id, platformChatId, text);
      const confirmed = chatMessageFromSend(sent.message, optimistic);
      setMessages((prev) => mergeChatMessage(prev, confirmed));
      if (user?.id && chatId) {
        void cacheTimeline(user.id, chatId, [{ ...confirmed, chat_id: chatId }]).catch(() => undefined);
      }
      requestAnimationFrame(() => {
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
      });
    } catch (err) {
      console.error('Send failed:', err);

      // Extract error message
      const errorMessage = err instanceof Error
        ? err.message
        : 'Failed to send message. Please try again.';

      setSendError(errorMessage);

      // Remove optimistic message and restore input
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setInputText(text);
    } finally {
      setSending(false);
    }
  }, [chatId, fetchChatInfo, inputText, platform, connectedSessions, user?.id]);

  const isBridgeFailure = (content: string) =>
    content.startsWith('* Failed to bridge media') ||
    content.startsWith('Failed to bridge media');

  const renderMessageBody = (item: ChatMessage) => {
    const textColor = colors.ink;
    const iconColor = colors.neutral[600];

    // Bridge decryption failure — show a muted placeholder instead of the raw error
    if (isBridgeFailure(item.content)) {
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <AlertCircle size={15} color={iconColor} />
          <Text style={{ ...mobileType.bodySmall, color: colors.neutral[400], fontStyle: 'italic' }}>
            Media unavailable
          </Text>
        </View>
      );
    }

    const type = item.content_type || 'text';

    if (type === 'image' && item.media_url) {
      const imageUri = normalizeMediaUrl(item.media_url);
      if (!imageUri) return null;
      return (
        <View>
          <MediaImage uri={imageUri} messageId={item.id} />
          {item.content ? (
            <Text style={{ ...mobileType.body, color: textColor, marginTop: 2 }}>{item.content}</Text>
          ) : null}
        </View>
      );
    }

    if (type === 'image') {
      return (
        <View testID={`media-image-${item.id}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <ImageIcon size={16} color={iconColor} />
          <Text style={{ fontSize: 14, color: textColor }}>Photo</Text>
        </View>
      );
    }

    if (type === 'audio') {
      return (
        <View testID={`media-audio-${item.id}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Volume2 size={16} color={iconColor} />
          <Text style={{ fontSize: 14, color: textColor }}>
            {item.content || 'Voice message'}
          </Text>
        </View>
      );
    }

    if (type === 'video' && item.media_url) {
      const videoUri = normalizeMediaUrl(item.media_url);
      if (videoUri) {
        return (
          <View>
            <MediaVideo uri={videoUri} messageId={item.id} />
            {item.content ? <Text style={{ fontSize: 14, color: textColor, marginTop: 2 }}>{item.content}</Text> : null}
          </View>
        );
      }
    }

    if (type === 'video') {
      return (
        <View testID={`media-video-${item.id}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Video size={16} color={iconColor} />
          <Text style={{ fontSize: 14, color: textColor }}>
            {item.content || 'Video'}
          </Text>
        </View>
      );
    }

    if (type === 'document') {
      return (
        <View testID={`media-document-${item.id}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <FileText size={16} color={iconColor} />
          <Text style={{ fontSize: 14, color: textColor }}>
            {item.content || 'File'}
          </Text>
        </View>
      );
    }

    // Default: text
    return (
      <Text style={{ ...mobileType.body, color: textColor }}>
        {item.content}
      </Text>
    );
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isMe = item.from_me;
    const isHighlighted = item.id === highlightMessageId;
    const subtextColor = colors.neutral[600];
    return (
      <View
        style={{
          flexDirection: 'row',
          justifyContent: isMe ? 'flex-end' : 'flex-start',
          paddingHorizontal: space[3],
          paddingVertical: 3,
        }}
        testID={`message-row-${item.id}-${isMe ? 'outgoing' : 'incoming'}`}
      >
        <InjectedBubble
          animate={item.id === latestInjectedId}
          testID={`message-bubble-${item.id}-${isMe ? 'outgoing' : 'incoming'}`}
          style={{
            maxWidth: '78%',
            backgroundColor: isMe ? colors.lime : colors.paper,
            borderWidth: isHighlighted ? 2 : 1,
            borderColor: isHighlighted ? colors.focus : colors.neutral[200],
            borderRadius: radius.card,
            borderBottomRightRadius: isMe ? 6 : radius.card,
            borderBottomLeftRadius: isMe ? radius.card : 6,
            paddingHorizontal: space[3],
            paddingVertical: space[2],
          }}
        >
          {!isMe && is_group === '1' && item.contact_name && (
            <Text style={{ ...mobileType.label, color: colors.neutral[600], marginBottom: 2 }}>
              {item.contact_name}
            </Text>
          )}
          {renderMessageBody(item)}
          <Text style={{ ...mobileType.label, fontSize: 10, color: subtextColor, marginTop: 3, textAlign: isMe ? 'right' : 'left' }}>
            {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </InjectedBubble>
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.cream }} edges={['top']} testID="chat-screen">
      {/* Header */}
      <Animated.View entering={FadeInDown.duration(240).springify().damping(20)} style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: space[3],
        paddingVertical: space[2],
        minHeight: 64,
        gap: space[2],
        borderBottomWidth: 1,
        borderBottomColor: colors.neutral[200],
        backgroundColor: colors.cream,
      }}>
        <MobileIconButton label="Back" onPress={() => router.back()}><ChevronLeft size={22} color={colors.ink} /></MobileIconButton>
        <MobileAvatar
          name={displayName}
          size={40}
          isGroup={is_group === '1'}
        />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }} numberOfLines={1}>
            {displayName}
          </Text>
          <PlatformName platform={platform} size={13} />
        </View>
        <MobileIconButton
          label="Conversation settings"
          onPress={() => router.push({
            pathname: '/chat/settings/[chatId]',
            params: { chatId: chatId!, platform, contact_name, chat_name, is_group },
          })}
        ><MoreHorizontal size={21} color={colors.ink} /></MobileIconButton>
      </Animated.View>

      {showQuickContext ? <View style={{ marginHorizontal: space[3], marginTop: space[2], padding: space[3], flexDirection: 'row', alignItems: 'center', gap: space[2], borderRadius: radius.control, borderWidth: 1, borderColor: colors.ink, backgroundColor: colors.sky }} testID="chat-quick-context">
        <View style={{ width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.lime }}><Sparkles size={15} color={colors.ink} /></View>
        <View style={{ flex: 1, minWidth: 0 }}><Text maxFontSizeMultiplier={1} style={{ ...mobileType.monoLabel, color: colors.ink }}>QUICK CONTEXT</Text><Text maxFontSizeMultiplier={1} numberOfLines={1} style={{ ...mobileType.bodySmall, color: colors.ink }}>{quickContext || 'Add relationship context for more personal replies.'}</Text></View>
        {contextCard ? <Pressable accessibilityRole="button" accessibilityLabel="Dismiss quick context" onPress={() => void dismissCard(chatId!, contextCard.id)} hitSlop={8} style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}><X size={17} color={colors.neutral[600]} /></Pressable> : null}
        <Pressable testID="ask-claire-button" onPress={() => needsRelationshipContext && !quickContext ? router.push({ pathname: '/chat/settings/[chatId]', params: { chatId: chatId!, platform, contact_name, chat_name, is_group } }) : router.push({ pathname: '/chat/assistant/[chatId]', params: { chatId: chatId!, name: displayName } })} style={({ pressed }) => ({ minHeight: 32, justifyContent: 'center', paddingHorizontal: space[2], borderRadius: radius.pill, borderWidth: 1, borderColor: colors.ink, backgroundColor: pressed ? colors.paper : 'transparent' })}><Text maxFontSizeMultiplier={1} style={{ ...mobileType.label, color: colors.ink }}>{needsRelationshipContext && !quickContext ? 'Set up' : 'Ask Claire'}</Text></Pressable>
      </View> : <View style={{ height: space[2] }} />}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={RNPlatform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Group Summary Banner — only shown for group chats */}
        {is_group === '1' && chatId && (
          <GroupChatSummary chatId={chatId} />
        )}

        {loading ? (
          <ChatSkeleton testID="chat-loading" />
        ) : (
          <FlatList
            ref={listRef}
            data={listData}
            inverted
            extraData={`${listData[0]?.id}:${latestInjectedId}`}
            renderItem={renderMessage}
            keyExtractor={(item) => item.id}
            testID="chat-message-list"
            contentContainerStyle={{ paddingVertical: space[3] }}
            keyboardShouldPersistTaps="handled"
            maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 80 }}
            onScrollToIndexFailed={({ index, averageItemLength }) => {
              listRef.current?.scrollToOffset({ offset: Math.max(0, index * averageItemLength), animated: false });
              setTimeout(() => listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.45 }), 100);
            }}
            ListEmptyComponent={
              <View style={{ transform: [{ scaleY: -1 }], alignItems: 'center', paddingTop: 60 }} testID="chat-empty">
                <Text style={{ ...mobileType.body, color: colors.neutral[400] }}>No messages yet</Text>
              </View>
            }
          />
        )}

        {/* AI Response Suggestions / Draft reply button */}
        {showReplyOptions && lastInbound ? (
          <ResponseSuggestion
            key={`${lastInbound.id}-${suggestionRefreshKey}`}
            messageId={lastInbound.id}
            messageContent={lastInbound.content}
            isGroup={is_group === '1'}
            refreshKey={suggestionRefreshKey}
            onSelectSuggestion={(text) => setInputText(text)}
          />
        ) : null}

        {/* Error display */}
        {sendError && (
          <View style={{
            paddingHorizontal: 12,
            paddingVertical: 8,
            backgroundColor: colors.blush,
            borderRadius: radius.control,
            marginHorizontal: 12,
            marginBottom: 8,
          }}>
            <Text style={{ ...mobileType.bodySmall, color: colors.danger }}>
              {sendError}
            </Text>
          </View>
        )}

        <View style={{ paddingHorizontal: space[3], paddingTop: space[2], paddingBottom: Math.max(insets.bottom, space[2]), borderTopWidth: 1, borderTopColor: colors.neutral[200], backgroundColor: colors.cream }}>
          {!isConnected && platform ? <Pressable testID="chat-reconnect" accessibilityRole="button" onPress={() => router.push('/connections')} style={({ pressed }) => ({ minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[2], borderRadius: 16, borderWidth: 1, borderColor: colors.warning, backgroundColor: pressed ? colors.warningSurface : colors.paper, opacity: connectionRefreshing ? 0.65 : 1 })}><Link2 size={18} color={colors.warning} /><Text maxFontSizeMultiplier={1} style={{ ...mobileType.bodySmall, fontWeight: '700', color: colors.warning }}>{connectionRefreshing ? 'Checking connection…' : `Reconnect ${platform}`}</Text></Pressable> : (
            <ChatComposer
              value={inputText}
              onChangeText={setInputText}
              onSend={() => void handleSend()}
              sending={sending}
              plusDefault={plusDefault}
              replyOptionsVisible={showReplyOptions}
              onToggleReplyOptions={lastInbound ? () => setShowReplyOptions((open) => !open) : undefined}
              blurOnSubmit={false}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
