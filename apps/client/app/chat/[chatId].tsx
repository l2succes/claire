import {
  View,
  Text,
  ActivityIndicator,
  Pressable,
  FlatList,
  KeyboardAvoidingView,
  Platform as RNPlatform,
  Image,
  Linking,
} from 'react-native';
import {
  ImageIcon,
  Volume2,
  Video,
  FileText,
  AlertCircle,
  Link2,
  MoreHorizontal,
  Sparkles,
  X,
  ChevronLeft,
  Play,
  MapPin,
} from 'lucide-react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase, type DbRow } from '../../services/supabase';
import { platformsApi, API_BASE_URL } from '../../services/platforms';
import { useAuthStore } from '../../stores/authStore';
import { usePlatformStore } from '../../stores/platformStore';
import { useChatPreferencesStore } from '../../stores/chatPreferencesStore';
import { ResponseSuggestion } from '../../components/ResponseSuggestion';
import { ChatComposer } from '../../components/claire/composer';
import { ComposerReplyTarget, MessageReplyPreview } from '../../components/claire/reply-reference';
import { MessageContextMenu } from '../../components/claire/message-context-menu';
import type { VoiceNoteDraft } from '../../components/claire/voice-note-control';
import { ChatSkeleton } from '../../components/claire/skeleton';
import { useConversationSettingsStore } from '../../stores/conversationSettingsStore';
import { GroupChatSummary } from '../../components/GroupChatSummary';
import { Platform } from '../../types/platform';
import { PlatformName } from '../../components/PlatformIcon';
import { displayContactName } from '../../services/contact-display';
import {
  setActiveNotificationChat,
  syncNotificationBadge,
  updateNotificationPresence,
} from '../../services/notifications';
import { colors, mobileType, radius, space } from '@claire/design-system';
import { useIsDesktopLayout } from '@claire/design-system';
import { host } from '@claire/host';
import { DesktopInboxWorkspace } from '../../features/desktop/desktop-inbox-workspace';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { MobileAvatar, MobileIconButton } from '../../components/mobile/claire-mobile';
import { cacheTimeline, cachedTimeline, usesNativeMobileCache } from '../../services/mobile-cache';
import { inboxQueryPrefix, patchInboxChat } from '../../hooks/useInboxMessages';
import {
  chatMessageFromSend,
  groupReactions,
  groupReactionsByMessage,
  isBridgeFailure,
  isLocalSend,
  isPlayableAudio,
  keepPendingSends,
  mergeChatMessage,
  parseMediaCaption,
  normalizeMediaUrl as normalizeMediaUrlWithBase,
  removeReactionRow,
  upsertReactionRow,
  type ChatMessage,
  type ReactionRow,
  type ReactionsByMessage,
} from '@claire/chat-core';

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
    transform: [{ translateY: (1 - progress.value) * 16 }, { scale: 0.82 + 0.18 * progress.value }],
  }));
  return (
    <Animated.View testID={testID} style={[style, { alignItems: 'flex-start' }, motion]}>
      {children}
    </Animated.View>
  );
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

// The shared helper takes the base URL as a parameter so desktop can pass its
// own; bind this client's once here.
function normalizeMediaUrl(value?: string | null): string | null {
  return normalizeMediaUrlWithBase(value, API_BASE_URL);
}

/**
 * Guidance the bridge appends about affordances it cannot carry across (tap
 * targets, call answering). It is about the message rather than part of it, so
 * it reads in a quieter, distinct voice, set off by a rule.
 */
function MessageHint({
  label,
  testID,
  divider = true,
}: {
  label: string;
  testID?: string;
  divider?: boolean;
}) {
  return (
    <View
      testID={testID}
      // Some messages are nothing but the hint ("Incoming call. Use the
      // WhatsApp app to answer."); a rule with nothing above it reads as a
      // rendering fault, so the divider only appears when there is body text.
      style={
        divider
          ? {
              marginTop: 8,
              paddingTop: 6,
              borderTopWidth: 1,
              borderTopColor: colors.neutral[200],
            }
          : undefined
      }
    >
      <Text
        maxFontSizeMultiplier={1.2}
        style={{
          ...mobileType.label,
          color: colors.neutral[400],
          fontStyle: 'italic',
          textAlign: 'left',
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function MessageBadge({ label, testID }: { label: string; testID?: string }) {
  return (
    <View
      testID={testID}
      style={{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 3,
        marginBottom: 6,
        borderRadius: 999,
        backgroundColor: colors.neutral[100],
      }}
    >
      <Text
        maxFontSizeMultiplier={1.2}
        style={{ ...mobileType.label, color: colors.neutral[600], textAlign: 'left' }}
      >
        {label}
      </Text>
    </View>
  );
}

function MediaImage({ uri, messageId }: { uri: string; messageId: string }) {
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  if (failed) {
    return (
      <View
        testID={`media-image-fallback-${messageId}`}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12 }}
      >
        <AlertCircle size={16} color={colors.neutral[400]} />
        <Text style={{ ...mobileType.bodySmall, color: colors.neutral[400], textAlign: 'left' }}>
          Media unavailable
        </Text>
      </View>
    );
  }
  return (
    <View testID={`media-image-${messageId}`}>
      {loading && (
        <ActivityIndicator
          testID={`media-image-loading-${messageId}`}
          size="small"
          color={colors.neutral[400]}
        />
      )}
      <Image
        source={{ uri }}
        style={{
          width: 220,
          height: 160,
          borderRadius: radius.control,
          marginBottom: 4,
          opacity: loading ? 0 : 1,
        }}
        resizeMode="cover"
        onLoad={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          setFailed(true);
        }}
        testID={`media-image-img-${messageId}`}
      />
    </View>
  );
}

function MediaVideo({ uri, messageId }: { uri: string; messageId: string }) {
  const video = expoVideoModule;
  if (!video) {
    return (
      <View
        testID={`media-video-fallback-${messageId}`}
        style={{
          width: 250,
          minHeight: 96,
          borderRadius: radius.control,
          marginBottom: 4,
          padding: space[3],
          gap: 6,
          backgroundColor: colors.neutral[100],
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Video size={22} color={colors.neutral[600]} />
        <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600], textAlign: 'left' }}>
          Video attachment
        </Text>
        <Text numberOfLines={1} style={{ ...mobileType.label, color: colors.focus }}>
          Update Claire to play this video
        </Text>
      </View>
    );
  }
  return <MediaVideoSurface uri={uri} messageId={messageId} />;
}

const VIDEO_SURFACE = {
  width: 250,
  height: 180,
  borderRadius: radius.control,
  marginBottom: 4,
  backgroundColor: colors.ink,
} as const;

/**
 * Mount the player only after a tap. useVideoPlayer allocates a native player
 * per call, and a busy conversation renders many video rows at once, so
 * creating them all up front costs memory and decoders for videos nobody
 * watches. Until then this is a poster with a play affordance.
 */
function MediaVideoSurface({ uri, messageId }: { uri: string; messageId: string }) {
  const [started, setStarted] = useState(false);
  if (!started) {
    return (
      <Pressable
        testID={`media-video-play-${messageId}`}
        accessibilityRole="button"
        accessibilityLabel="Play video"
        onPress={() => setStarted(true)}
        style={({ pressed }) => ({
          ...VIDEO_SURFACE,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.paper,
          }}
        >
          <Play size={22} color={colors.ink} fill={colors.ink} />
        </View>
      </Pressable>
    );
  }
  return <MediaVideoPlayer uri={uri} messageId={messageId} />;
}

function MediaVideoPlayer({ uri, messageId }: { uri: string; messageId: string }) {
  const video = expoVideoModule!;
  const player = video.useVideoPlayer(uri, (instance) => {
    instance.loop = false;
    instance.play();
  });
  const VideoView = video.VideoView;
  return (
    <VideoView
      testID={`media-video-player-${messageId}`}
      player={player}
      nativeControls
      contentFit="contain"
      playsInline
      style={VIDEO_SURFACE}
    />
  );
}

function MediaAudio({
  uri,
  mime,
  messageId,
  label,
}: {
  uri: string;
  mime?: string | null;
  messageId: string;
  label: string;
}) {
  const [started, setStarted] = useState(false);
  const playable = isPlayableAudio(mime) && !!expoVideoModule;

  return (
    // The bubble sizes to its content, so a flex:1 child here would resolve to
    // zero width and wrap the label one character per line. Give the row an
    // explicit width to lay out against.
    <View
      testID={`media-audio-${messageId}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[2],
        minHeight: 40,
        width: 210,
      }}
    >
      <Pressable
        testID={`media-audio-play-${messageId}`}
        accessibilityRole="button"
        accessibilityLabel={playable ? 'Play voice message' : 'Voice message cannot be played yet'}
        accessibilityState={{ disabled: !playable }}
        disabled={!playable || started}
        onPress={() => setStarted(true)}
        style={({ pressed }) => ({
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: playable ? colors.lime : colors.neutral[100],
          opacity: pressed ? 0.85 : 1,
        })}
      >
        {playable ? (
          <Play size={17} color={colors.ink} fill={colors.ink} />
        ) : (
          <Volume2 size={17} color={colors.neutral[400]} />
        )}
      </Pressable>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ ...mobileType.bodySmall, color: colors.ink }}>
          {label}
        </Text>
        {!playable ? (
          <Text numberOfLines={1} style={{ ...mobileType.label, color: colors.neutral[400] }}>
            Playback needs a supported format
          </Text>
        ) : null}
      </View>
      {started && playable ? <MediaAudioPlayer uri={uri} messageId={messageId} /> : null}
    </View>
  );
}

function MediaAudioPlayer({ uri, messageId }: { uri: string; messageId: string }) {
  const video = expoVideoModule!;
  const player = video.useVideoPlayer(uri, (instance) => {
    instance.loop = false;
    instance.play();
  });
  const VideoView = video.VideoView;
  // Audio-only source: keep the surface out of layout but mounted so the
  // player stays attached while it plays.
  return (
    <VideoView
      testID={`media-audio-player-${messageId}`}
      player={player}
      nativeControls={false}
      style={{ width: 0, height: 0 }}
    />
  );
}

export default function ChatRoute() {
  const isDesktop = useIsDesktopLayout();
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  return isDesktop ? (
    <DesktopInboxWorkspace selectedChatId={chatId} conversation={<ChatScreen embedded />} />
  ) : (
    <ChatScreen />
  );
}

export function ChatScreen({ embedded = false }: { embedded?: boolean }) {
  const queryClient = useQueryClient();
  const { chatId, contact_name, chat_name, platform, is_group, highlightMessageId, draft } =
    useLocalSearchParams<{
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
  const availablePlatforms = usePlatformStore((state) => state.availablePlatforms);
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
  const platformCapabilities = availablePlatforms.find(
    (candidate) => candidate.platform === (platform as Platform)
  )?.capabilities;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reactionsByMessage, setReactionsByMessage] = useState<ReactionsByMessage>({});
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  const [messageActionTarget, setMessageActionTarget] = useState<ChatMessage | null>(null);
  const [suggestionRefreshKey, setSuggestionRefreshKey] = useState(0);
  const [showReplyOptions, setShowReplyOptions] = useState(false);
  const [connectionRefreshing, setConnectionRefreshing] = useState(false);
  const platformChatIdRef = useRef<string | null>(null);
  const listRef = useRef<FlatList>(null);
  const composerRef = useRef<import('react-native').TextInput>(null);
  const hasScrolledToHighlight = useRef(false);
  // State updates do not disable the send control synchronously. This ref
  // closes the double-tap window before React has rendered `sending=true`.
  const textSendInFlightRef = useRef(false);
  const reactionInFlightRef = useRef(new Set<string>());

  useEffect(() => {
    if (draft) setInputText(draft);
  }, [draft]);

  const displayName =
    is_group === '1'
      ? chat_name || contact_name || 'Group'
      : displayContactName(contact_name || chat_name, platform, undefined, 'Contact');
  const activeSession = connectedSessions.find(
    (session) => session.platform === (platform as Platform) && session.status === 'connected'
  );
  const isConnected = !!activeSession;
  const contextCard = smartCards[0];
  const quickContext =
    contextCard?.subtitle ||
    contextCard?.title ||
    contactProfile?.ai_instruction ||
    contactProfile?.relationship_context ||
    null;
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
        .select(
          'id, chat_id, content, timestamp, from_me, contact_name, contact_phone, content_type, media_url, media_mime_type, platform_message_id, reply_to_message_id, reply_to_platform_message_id'
        )
        .eq('chat_id', chatId)
        .eq('user_id', user.id)
        .order('timestamp', { ascending: false })
        .limit(100);
      if (error) throw error;
      let loadedMessages = data || [];
      // Assistant citations can reference older history than the normal chat
      // window. Fetch the cited row explicitly so it is always reachable.
      if (
        highlightMessageId &&
        !loadedMessages.some((message: DbRow) => message.id === highlightMessageId)
      ) {
        const { data: highlightedMessage, error: highlightError } = await supabase
          .from('messages')
          .select(
            'id, chat_id, content, timestamp, from_me, contact_name, contact_phone, content_type, media_url, media_mime_type, platform_message_id, reply_to_message_id, reply_to_platform_message_id'
          )
          .eq('id', highlightMessageId)
          .eq('chat_id', chatId)
          .eq('user_id', user.id)
          .maybeSingle();
        if (highlightError) throw highlightError;
        if (highlightedMessage) loadedMessages = [...loadedMessages, highlightedMessage];
      }
      const byId = new Map<string, ChatMessage>(
        loadedMessages.map((message: DbRow) => [message.id as string, message as ChatMessage])
      );
      const deduplicated = [...byId.values()].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      setMessages((current) => keepPendingSends(deduplicated, current));
      const messageIds = deduplicated.map((message) => message.id).filter(Boolean);
      if (messageIds.length) {
        const { data: reactionRows, error: reactionsError } = await supabase
          .from('message_reactions')
          .select('id, message_id, emoji, from_me, reactor_id, reactor_name, reacted_at')
          .in('message_id', messageIds);
        // A client can ship slightly before the database migration. Reactions
        // should be unavailable in that state, never prevent the chat loading.
        if (reactionsError) console.warn('Failed to fetch message reactions:', reactionsError);
        else setReactionsByMessage(groupReactionsByMessage((reactionRows || []) as ReactionRow[]));
      } else {
        setReactionsByMessage({});
      }
      // The timeline select does not return chat_id, so stamp it on before
      // caching: cacheTimeline keys rows by conversation and silently caches
      // orphans without it.
      if (usesNativeMobileCache())
        void cacheTimeline(
          user.id,
          chatId,
          deduplicated.map((message) => ({ ...message, chat_id: chatId }))
        ).catch(() => undefined);
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
      (candidate) =>
        candidate.platform === (platform as Platform) && candidate.status === 'connected'
    );
    try {
      await platformsApi.markChatRead(chatId, session?.id);
      // Realtime normally carries this chat-row update back to the inbox, but
      // it can arrive after someone has already navigated back. Patch every
      // cached inbox view now and refetch filter variants (especially Unread)
      // so neither the row nor the app badge retains a stale count.
      patchInboxChat(queryClient, user?.id, {
        id: chatId,
        platform: platform as Platform,
        unread_count: 0,
      });
      void queryClient.invalidateQueries({ queryKey: inboxQueryPrefix(user?.id) });
      await syncNotificationBadge().catch(() => undefined);
    } catch (error) {
      console.warn('Failed to mark conversation read:', error);
    }
  }, [chatId, platform, connectedSessions, queryClient, user?.id]);

  useEffect(() => {
    if (!chatId) return;
    setActiveNotificationChat(chatId);
    if (accessToken)
      updateNotificationPresence(accessToken, 'foreground', chatId).catch(() => undefined);
    return () => {
      setActiveNotificationChat(undefined);
      if (accessToken) updateNotificationPresence(accessToken, 'foreground').catch(() => undefined);
    };
  }, [accessToken, chatId]);

  useEffect(() => {
    host.reportActiveConversation(chatId || null);
    return () => host.reportActiveConversation(null);
  }, [chatId]);

  useEffect(() => host.onFocusComposer(() => composerRef.current?.focus()), []);

  // The realtime channel must live exactly as long as the open conversation.
  // Depending on these callbacks directly would tie its lifetime to their
  // identity instead: markConversationRead closes over connectedSessions and
  // also refreshes the notification badge, so calling it produces a new store
  // array, a new callback, and another teardown/resubscribe — a feedback loop
  // that measured 91 joins for three chat opens. Read them through a ref so the
  // handlers always see the latest version without re-running the effect.
  const chatEffectRef = useRef({
    fetchMessages,
    markConversationRead,
    refreshConnection,
    fetchConvSettings,
  });
  chatEffectRef.current = {
    fetchMessages,
    markConversationRead,
    refreshConnection,
    fetchConvSettings,
  };

  useEffect(() => {
    chatEffectRef.current.fetchMessages().then(() => chatEffectRef.current.markConversationRead());
    void chatEffectRef.current.refreshConnection();
    if (chatId) chatEffectRef.current.fetchConvSettings(chatId);

    const subscription = supabase
      .channel(
        `chat-${chatId}-${user?.id ?? 'anonymous'}-${Math.random().toString(36).slice(2, 10)}`
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
        (payload) => {
          const inserted = payload.new as ChatMessage;
          if (usesNativeMobileCache() && user?.id)
            void cacheTimeline(user.id, chatId, [{ ...inserted, chat_id: chatId }]).catch(
              () => undefined
            );
          setMessages((prev) => mergeChatMessage(prev, inserted));
          if (!inserted.from_me) void chatEffectRef.current.markConversationRead();
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
        (payload) => {
          const updated = payload.new as ChatMessage;
          setMessages((prev) => mergeChatMessage(prev, updated));
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chats', filter: `id=eq.${chatId}` },
        (payload) => {
          // Message insertion and unread increment are separate writes. If the
          // increment wins the race after this open chat marked itself read,
          // immediately advance the cursor again so the inbox never regains a
          // stale unread badge for a conversation already on screen.
          const updated = payload.new as { unread_count?: number };
          if ((updated.unread_count || 0) > 0) void chatEffectRef.current.markConversationRead();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_reactions',
          filter: user?.id ? `user_id=eq.${user.id}` : undefined,
        },
        (payload) => {
          setReactionsByMessage((current) =>
            upsertReactionRow(current, payload.new as ReactionRow)
          );
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'message_reactions',
          filter: user?.id ? `user_id=eq.${user.id}` : undefined,
        },
        (payload) => {
          setReactionsByMessage((current) =>
            removeReactionRow(current, payload.old as { id?: string; message_id?: string | null })
          );
        }
      )
      .on(
        'postgres_changes',
        {
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

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [chatId, user?.id]);

  useEffect(() => {
    void hydrateChatPreferences();
  }, [hydrateChatPreferences]);

  useEffect(() => {
    hasScrolledToHighlight.current = false;
  }, [highlightMessageId]);

  const listData = useMemo(() => [...messages].reverse(), [messages]);
  const lastInbound = useMemo(
    () => [...messages].reverse().find((message) => !message.from_me),
    [messages]
  );
  const latestInjectedId = useMemo(
    () =>
      [...messages].reverse().find((message) => message.from_me && isLocalSend(message.id))?.id ??
      null,
    [messages]
  );
  const messageById = useMemo(
    () => new Map(messages.map((message) => [message.id, message])),
    [messages]
  );

  useEffect(() => {
    if (!highlightMessageId || hasScrolledToHighlight.current) return;
    const index = listData.findIndex((message) => message.id === highlightMessageId);
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
    if (textSendInFlightRef.current) return;
    textSendInFlightRef.current = true;
    const text = inputText.trim();
    if (!text || !platform) {
      setSendError('Unable to determine platform');
      textSendInFlightRef.current = false;
      return;
    }

    let platformChatId = platformChatIdRef.current;
    if (!platformChatId) {
      try {
        await fetchChatInfo();
        platformChatId = platformChatIdRef.current;
      } catch (error) {
        console.error('Could not resolve chat before sending:', error);
        setSendError('Chat configuration error - please reopen this chat');
        textSendInFlightRef.current = false;
        return;
      }
    }
    if (!platformChatId) {
      setSendError('Chat configuration error - please reopen this chat');
      textSendInFlightRef.current = false;
      return;
    }

    const session = connectedSessions.find(
      (s) => s.platform === (platform as Platform) && s.status === 'connected'
    );
    const localIMessage = platform === Platform.IMESSAGE && host.name === 'electron';
    if (!session && !localIMessage) {
      setSendError(`Not connected to ${platform}. Reconnect it from Connections.`);
      textSendInFlightRef.current = false;
      return;
    }

    // Clear any previous errors
    setSendError(null);

    const replyTargetAtSend = replyTarget;
    const replyToMessageId = replyTargetAtSend?.platform_message_id;
    if (replyTargetAtSend && !replyToMessageId) {
      setSendError('This message is still syncing. Try replying in a moment.');
      textSendInFlightRef.current = false;
      return;
    }

    // Optimistic update
    const optimistic: ChatMessage = {
      id: `optimistic-${Date.now()}`,
      content: text,
      timestamp: new Date().toISOString(),
      from_me: true,
      reply_to_message_id: replyTargetAtSend?.id ?? null,
      reply_to_platform_message_id: replyToMessageId ?? null,
    };
    setMessages((prev) => [...prev, optimistic]);
    if (user?.id && chatId) {
      void cacheTimeline(user.id, chatId, [{ ...optimistic, chat_id: chatId }]).catch(
        () => undefined
      );
    }
    setInputText('');
    setReplyTarget(null);
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    });

    setSending(true);
    try {
      const localResult = localIMessage
        ? await host.sendIMessage({ recipient: platformChatId, text })
        : null;
      if (localResult && !localResult.success) throw new Error(localResult.error);
      const sent = localIMessage
        ? null
        : await platformsApi.sendMessage(
            platform as Platform,
            session!.id,
            platformChatId,
            text,
            replyToMessageId
          );
      // The local companion scanner will reconcile the optimistic iMessage
      // send with Messages' durable row. Keep it visible immediately.
      const confirmed = sent ? chatMessageFromSend(sent.message, optimistic) : optimistic;
      setMessages((prev) => mergeChatMessage(prev, confirmed));
      if (user?.id && chatId) {
        void cacheTimeline(user.id, chatId, [{ ...confirmed, chat_id: chatId }]).catch(
          () => undefined
        );
      }
      requestAnimationFrame(() => {
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
      });
    } catch (err) {
      console.error('Send failed:', err);

      // Extract error message
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to send message. Please try again.';

      setSendError(errorMessage);

      // Remove optimistic message and restore input
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setInputText(text);
      setReplyTarget(replyTargetAtSend);
    } finally {
      setSending(false);
      textSendInFlightRef.current = false;
    }
  }, [chatId, connectedSessions, fetchChatInfo, inputText, platform, replyTarget, user?.id]);

  const handleSendVoice = useCallback(async (draft: VoiceNoteDraft) => {
    if (!platform) {
      setSendError('Unable to determine platform');
      throw new Error('Unable to determine platform');
    }
    const platformChatId =
      platformChatIdRef.current || ((await fetchChatInfo()) ? platformChatIdRef.current : null);
    if (!platformChatId) {
      const error = new Error('Chat configuration error - please reopen this chat');
      setSendError(error.message);
      throw error;
    }
    const session = connectedSessions.find(
      (candidate) => candidate.platform === (platform as Platform) && candidate.status === 'connected'
    );
    if (!session) {
      const error = new Error(`Not connected to ${platform}. Reconnect it from Connections.`);
      setSendError(error.message);
      throw error;
    }
    const replyTargetAtSend = replyTarget;
    const replyToMessageId = replyTargetAtSend?.platform_message_id;
    if (replyTargetAtSend && !replyToMessageId) {
      const error = new Error('This message is still syncing. Try replying in a moment.');
      setSendError(error.message);
      throw error;
    }

    setSendError(null);
    const optimistic: ChatMessage = {
      id: `optimistic-${Date.now()}`,
      content: 'Voice message',
      content_type: 'audio',
      media_url: draft.uri,
      media_mime_type: draft.mimeType,
      timestamp: new Date().toISOString(),
      from_me: true,
      reply_to_message_id: replyTargetAtSend?.id ?? null,
      reply_to_platform_message_id: replyToMessageId ?? null,
    };
    setMessages((current) => [...current, optimistic]);
    if (user?.id && chatId) {
      void cacheTimeline(user.id, chatId, [{ ...optimistic, chat_id: chatId }]).catch(() => undefined);
    }
    setReplyTarget(null);
    setSending(true);
    try {
      const sent = await platformsApi.sendVoiceMessage(
        platform as Platform,
        session.id,
        platformChatId,
        draft,
        replyToMessageId
      );
      const confirmed = chatMessageFromSend(sent.message, optimistic);
      setMessages((current) => mergeChatMessage(current, confirmed));
      if (user?.id && chatId) {
        void cacheTimeline(user.id, chatId, [{ ...confirmed, chat_id: chatId }]).catch(() => undefined);
      }
      requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }));
    } catch (error) {
      console.error('Voice-note send failed:', error);
      const message = error instanceof Error ? error.message : 'Failed to send voice note. Please try again.';
      setSendError(message);
      setMessages((current) => current.filter((item) => item.id !== optimistic.id));
      setReplyTarget(replyTargetAtSend);
      throw error;
    } finally {
      setSending(false);
    }
  }, [chatId, connectedSessions, fetchChatInfo, platform, replyTarget, user?.id]);

  const handleReact = useCallback(
    async (emoji: string) => {
      const target = messageActionTarget;
      const targetPlatformId = target?.platform_message_id;
      const session = connectedSessions.find(
        (candidate) =>
          candidate.platform === (platform as Platform) && candidate.status === 'connected'
      );
      if (!target || !targetPlatformId || !platform || !session) {
        setSendError('This message is still syncing. Try reacting in a moment.');
        return;
      }
      if (!platformCapabilities?.canSendReactions) {
        setSendError(`${platform} does not support message reactions.`);
        return;
      }

      let platformChatId = platformChatIdRef.current;
      if (!platformChatId) {
        try {
          await fetchChatInfo();
          platformChatId = platformChatIdRef.current;
        } catch (error) {
          console.error('Could not resolve chat before reacting:', error);
          setSendError('Chat configuration error - please reopen this chat');
          return;
        }
      }
      if (!platformChatId) {
        setSendError('Chat configuration error - please reopen this chat');
        return;
      }

      const reactionKey = `${target.id}:${emoji}`;
      if (reactionInFlightRef.current.has(reactionKey)) return;
      if (
        (reactionsByMessage[target.id] || []).some(
          (reaction) => reaction.from_me && reaction.emoji === emoji
        )
      ) {
        setMessageActionTarget(null);
        return;
      }

      reactionInFlightRef.current.add(reactionKey);
      const optimisticId = `optimistic-reaction-${Date.now()}`;
      const optimistic: ReactionRow = {
        id: optimisticId,
        message_id: target.id,
        emoji,
        from_me: true,
        reactor_id: 'self',
        reacted_at: new Date().toISOString(),
      };
      setReactionsByMessage((current) => upsertReactionRow(current, optimistic));
      setMessageActionTarget(null);

      try {
        const response = await platformsApi.reactToMessage(
          platform as Platform,
          session.id,
          platformChatId,
          targetPlatformId,
          emoji
        );
        setReactionsByMessage((current) =>
          upsertReactionRow(current, response.reaction as ReactionRow)
        );
      } catch (error) {
        setReactionsByMessage((current) => removeReactionRow(current, { id: optimisticId }));
        setSendError(error instanceof Error ? error.message : 'Failed to add reaction. Try again.');
      } finally {
        reactionInFlightRef.current.delete(reactionKey);
      }
    },
    [
      connectedSessions,
      fetchChatInfo,
      messageActionTarget,
      platform,
      platformCapabilities?.canSendReactions,
      reactionsByMessage,
    ]
  );

  const renderMessageBody = (item: ChatMessage) => {
    const textColor = colors.ink;
    const iconColor = colors.neutral[600];

    // Bridge decryption failure — show a muted placeholder instead of the raw error
    if (isBridgeFailure(item.content)) {
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <AlertCircle size={15} color={iconColor} />
          <Text
            style={{ ...mobileType.bodySmall, color: colors.neutral[400], fontStyle: 'italic' }}
          >
            Media unavailable
          </Text>
        </View>
      );
    }

    const type = item.content_type || 'text';

    const caption = parseMediaCaption(item.content);

    if (type === 'image' && item.media_url) {
      const imageUri = normalizeMediaUrl(item.media_url);
      if (!imageUri) return null;
      return (
        <View>
          {caption.badge ? (
            <MessageBadge label={caption.badge} testID={`media-badge-${item.id}`} />
          ) : null}
          <MediaImage uri={imageUri} messageId={item.id} />
          {caption.text ? (
            <Text style={{ ...mobileType.body, color: textColor, marginTop: 2, textAlign: 'left' }}>
              {caption.text}
            </Text>
          ) : null}
          {caption.hint ? (
            <MessageHint label={caption.hint} testID={`media-hint-${item.id}`} />
          ) : null}
        </View>
      );
    }

    if (type === 'image') {
      return (
        <View
          testID={`media-image-${item.id}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
        >
          <ImageIcon size={16} color={iconColor} />
          <Text style={{ fontSize: 14, color: textColor, textAlign: 'left' }}>Photo</Text>
        </View>
      );
    }

    if (type === 'audio' || type === 'voice') {
      const audioUri = normalizeMediaUrl(item.media_url);
      return (
        <MediaAudio
          uri={audioUri || ''}
          mime={audioUri ? item.media_mime_type : null}
          messageId={item.id}
          label={caption.text || caption.badge || 'Voice message'}
        />
      );
    }

    if (type === 'video' && item.media_url) {
      const videoUri = normalizeMediaUrl(item.media_url);
      if (videoUri) {
        return (
          <View>
            {caption.badge ? (
              <MessageBadge label={caption.badge} testID={`media-badge-${item.id}`} />
            ) : null}
            <MediaVideo uri={videoUri} messageId={item.id} />
            {caption.text ? (
              <Text style={{ fontSize: 14, color: textColor, marginTop: 2, textAlign: 'left' }}>
                {caption.text}
              </Text>
            ) : null}
          </View>
        );
      }
    }

    if (type === 'video') {
      return (
        <View
          testID={`media-video-${item.id}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
        >
          <Video size={16} color={iconColor} />
          <Text style={{ fontSize: 14, color: textColor, textAlign: 'left' }}>
            {item.content || 'Video'}
          </Text>
        </View>
      );
    }

    if (type === 'document') {
      const documentUri = normalizeMediaUrl(item.media_url);
      const label = caption.text || caption.badge || 'File';
      const body = (
        // Same content-sized-bubble constraint as the audio row: without an
        // explicit width the label collapses and wraps per character.
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], width: 210 }}>
          <FileText size={18} color={documentUri ? colors.ink : iconColor} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              style={{ ...mobileType.bodySmall, color: textColor, textAlign: 'left' }}
            >
              {label}
            </Text>
            {documentUri ? (
              <Text style={{ ...mobileType.label, color: colors.neutral[400] }}>Tap to open</Text>
            ) : null}
          </View>
        </View>
      );
      if (!documentUri) return <View testID={`media-document-${item.id}`}>{body}</View>;
      return (
        <Pressable
          testID={`media-document-${item.id}`}
          accessibilityRole="button"
          accessibilityLabel={`Open ${label}`}
          onPress={() => {
            void Linking.openURL(documentUri).catch(() => undefined);
          }}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          {body}
        </Pressable>
      );
    }

    if (type === 'location') {
      // Previously fell through to the text branch and printed raw coordinates.
      return (
        <View
          testID={`media-location-${item.id}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}
        >
          <MapPin size={17} color={iconColor} />
          <Text
            numberOfLines={2}
            style={{ ...mobileType.bodySmall, color: textColor, textAlign: 'left' }}
          >
            {caption.text || 'Shared a location'}
          </Text>
        </View>
      );
    }

    // Default: text. Keep links intact here — a message that is only a URL is
    // the whole message — but still lift out placeholders and the native-app
    // hint so they do not read as body copy.
    const body = parseMediaCaption(item.content, { dropSelfLinks: false });
    if (!body.badge && !body.hint) {
      return (
        <Text style={{ ...mobileType.body, color: textColor, textAlign: 'left' }}>
          {body.text ?? item.content}
        </Text>
      );
    }
    return (
      <View>
        {body.badge ? <MessageBadge label={body.badge} testID={`text-badge-${item.id}`} /> : null}
        {body.text ? (
          <Text style={{ ...mobileType.body, color: textColor, textAlign: 'left' }}>
            {body.text}
          </Text>
        ) : null}
        {body.hint ? (
          <MessageHint
            label={body.hint}
            testID={`text-hint-${item.id}`}
            divider={!!(body.text || body.badge)}
          />
        ) : null}
      </View>
    );
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isMe = item.from_me;
    const isHighlighted = item.id === highlightMessageId;
    const subtextColor = colors.neutral[600];
    const replySource = item.reply_to_message_id ? messageById.get(item.reply_to_message_id) : null;
    const canReplyToMessage = Boolean(item.platform_message_id) && Boolean(platformCapabilities?.canReplyToMessages);
    const hasActionsOpen = messageActionTarget?.id === item.id;
    const replySender = replySource?.from_me ? 'You' : replySource?.contact_name || displayName;
    const reactionChips = groupReactions(reactionsByMessage[item.id] || []);
    return (
      <View
        style={{
          position: 'relative',
          flexDirection: 'row',
          justifyContent: isMe ? 'flex-end' : 'flex-start',
          paddingHorizontal: space[3],
          paddingVertical: 3,
        }}
        testID={`message-row-${item.id}-${isMe ? 'outgoing' : 'incoming'}`}
      >
        <Pressable
          style={{ width: '78%', maxWidth: '78%' }}
          accessibilityRole={canReplyToMessage || Boolean(item.content) ? 'button' : undefined}
          accessibilityHint={canReplyToMessage || Boolean(item.content) ? 'Long press for message actions' : undefined}
          delayLongPress={350}
          onLongPress={
            canReplyToMessage || Boolean(item.content)
              ? () => {
                  setMessageActionTarget((current) => (current?.id === item.id ? null : item));
                }
              : undefined
          }
        >
          <InjectedBubble
            animate={item.id === latestInjectedId}
            testID={`message-bubble-${item.id}-${isMe ? 'outgoing' : 'incoming'}`}
            style={{
              // The press target owns the percentage width. Without an
              // explicit width it shrink-wraps its content, leaving this
              // percentage with no meaningful container and wrapping words
              // into narrow vertical bubbles.
              width: '100%',
              maxWidth: '100%',
              backgroundColor: isMe ? colors.lime : colors.paper,
              borderWidth: isHighlighted || hasActionsOpen ? 2 : 1,
              borderColor: isHighlighted ? colors.focus : hasActionsOpen ? colors.ink : colors.neutral[200],
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
            {replySource ? (
              <MessageReplyPreview sender={replySender} content={replySource.content} />
            ) : null}
            {renderMessageBody(item)}
            {reactionChips.length ? (
              <View
                accessibilityLabel={reactionChips
                  .map((reaction) => `${reaction.emoji} ${reaction.count}`)
                  .join(', ')}
                style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: space[2] }}
              >
                {reactionChips.map((reaction) => (
                  <View
                    key={reaction.emoji}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 3,
                      minHeight: 24,
                      paddingHorizontal: 7,
                      borderRadius: radius.pill,
                      borderWidth: 1,
                      borderColor: reaction.mine ? colors.ink : colors.neutral[200],
                      backgroundColor: reaction.mine ? colors.paper : colors.neutral[100],
                    }}
                  >
                    <Text style={{ fontSize: 13 }}>{reaction.emoji}</Text>
                    {reaction.count > 1 ? (
                      <Text style={{ ...mobileType.label, color: colors.ink }}>{reaction.count}</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}
            <Text
              style={{
                ...mobileType.label,
                fontSize: 10,
                color: subtextColor,
                marginTop: 3,
                textAlign: isMe ? 'right' : 'left',
              }}
            >
              {new Date(item.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          </InjectedBubble>
        </Pressable>
      </View>
    );
  };

  return (
    <SafeAreaView
      style={{ flex: 1, minHeight: 0, backgroundColor: colors.cream }}
      edges={embedded ? [] : ['top']}
      testID="chat-screen"
    >
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: space[3],
          paddingVertical: space[2],
          minHeight: 64,
          gap: space[2],
          borderBottomWidth: 1,
          borderBottomColor: colors.neutral[200],
          backgroundColor: colors.cream,
        }}
      >
        {!embedded ? (
          <MobileIconButton label="Back" onPress={() => router.back()}>
            <ChevronLeft size={22} color={colors.ink} />
          </MobileIconButton>
        ) : null}
        <MobileAvatar name={displayName} size={40} isGroup={is_group === '1'} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text
            style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}
            numberOfLines={1}
          >
            {displayName}
          </Text>
          <PlatformName platform={platform} size={13} />
        </View>
        <MobileIconButton
          label="Conversation settings"
          onPress={() =>
            router.push({
              pathname: '/chat/settings/[chatId]',
              params: { chatId: chatId!, platform, contact_name, chat_name, is_group },
            })
          }
        >
          <MoreHorizontal size={21} color={colors.ink} />
        </MobileIconButton>
      </View>

      {showQuickContext ? (
        <View
          style={{
            marginHorizontal: space[3],
            marginTop: space[2],
            padding: space[3],
            flexDirection: 'row',
            alignItems: 'center',
            gap: space[2],
            borderRadius: radius.control,
            borderWidth: 1,
            borderColor: colors.ink,
            backgroundColor: colors.sky,
          }}
          testID="chat-quick-context"
        >
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 9,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.lime,
            }}
          >
            <Sparkles size={15} color={colors.ink} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text maxFontSizeMultiplier={1} style={{ ...mobileType.monoLabel, color: colors.ink }}>
              QUICK CONTEXT
            </Text>
            <Text
              maxFontSizeMultiplier={1}
              numberOfLines={1}
              style={{ ...mobileType.bodySmall, color: colors.ink }}
            >
              {quickContext || 'Add relationship context for more personal replies.'}
            </Text>
          </View>
          {contextCard ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss quick context"
              onPress={() => void dismissCard(chatId!, contextCard.id)}
              hitSlop={8}
              style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={17} color={colors.neutral[600]} />
            </Pressable>
          ) : null}
          <Pressable
            testID="ask-claire-button"
            onPress={() =>
              needsRelationshipContext && !quickContext
                ? router.push({
                    pathname: '/chat/settings/[chatId]',
                    params: { chatId: chatId!, platform, contact_name, chat_name, is_group },
                  })
                : router.push({
                    pathname: '/chat/assistant/[chatId]',
                    params: { chatId: chatId!, name: displayName },
                  })
            }
            style={({ pressed }) => ({
              minHeight: 32,
              justifyContent: 'center',
              paddingHorizontal: space[2],
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: colors.ink,
              backgroundColor: pressed ? colors.paper : 'transparent',
            })}
          >
            <Text maxFontSizeMultiplier={1} style={{ ...mobileType.label, color: colors.ink }}>
              {needsRelationshipContext && !quickContext ? 'Set up' : 'Ask Claire'}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ height: space[2] }} />
      )}

      <KeyboardAvoidingView
        style={{ flex: 1, minHeight: 0 }}
        behavior={RNPlatform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Group Summary Banner — only shown for group chats */}
        {is_group === '1' && chatId && <GroupChatSummary chatId={chatId} />}

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
            style={{ flex: 1, minHeight: 0 }}
            contentContainerStyle={{ paddingVertical: space[3] }}
            keyboardShouldPersistTaps="handled"
            maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 80 }}
            onScrollToIndexFailed={({ index, averageItemLength }) => {
              listRef.current?.scrollToOffset({
                offset: Math.max(0, index * averageItemLength),
                animated: false,
              });
              setTimeout(
                () => listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.45 }),
                100
              );
            }}
            ListEmptyComponent={
              <View
                style={{ transform: [{ scaleY: -1 }], alignItems: 'center', paddingTop: 60 }}
                testID="chat-empty"
              >
                <Text style={{ ...mobileType.body, color: colors.neutral[400] }}>
                  No messages yet
                </Text>
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
          <View
            style={{
              paddingHorizontal: 12,
              paddingVertical: 8,
              backgroundColor: colors.blush,
              borderRadius: radius.control,
              marginHorizontal: 12,
              marginBottom: 8,
            }}
          >
            <Text style={{ ...mobileType.bodySmall, color: colors.danger }}>{sendError}</Text>
          </View>
        )}

        <View
          style={{
            paddingHorizontal: space[3],
            paddingTop: space[2],
            paddingBottom: Math.max(insets.bottom, space[2]),
            borderTopWidth: 1,
            borderTopColor: colors.neutral[200],
            backgroundColor: colors.cream,
          }}
        >
          {!isConnected && platform ? (
            <Pressable
              testID="chat-reconnect"
              accessibilityRole="button"
              onPress={() => router.push('/connections')}
              style={({ pressed }) => ({
                minHeight: 48,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: space[2],
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.warning,
                backgroundColor: pressed ? colors.warningSurface : colors.paper,
                opacity: connectionRefreshing ? 0.65 : 1,
              })}
            >
              <Link2 size={18} color={colors.warning} />
              <Text
                maxFontSizeMultiplier={1}
                style={{ ...mobileType.bodySmall, fontWeight: '700', color: colors.warning }}
              >
                {connectionRefreshing ? 'Checking connection…' : `Reconnect ${platform}`}
              </Text>
            </Pressable>
          ) : (
            <ChatComposer
              value={inputText}
              onChangeText={setInputText}
              onSend={() => void handleSend()}
              sending={sending}
              plusDefault={plusDefault}
              replyOptionsVisible={showReplyOptions}
              onToggleReplyOptions={
                lastInbound ? () => setShowReplyOptions((open) => !open) : undefined
              }
              voiceEnabled={Boolean(platformCapabilities?.canSendVoice) && isConnected}
              onSendVoice={handleSendVoice}
              accessory={
                replyTarget ? (
                  <ComposerReplyTarget
                    sender={replyTarget.from_me ? 'You' : replyTarget.contact_name || displayName}
                    content={replyTarget.content}
                    onCancel={() => setReplyTarget(null)}
                  />
                ) : undefined
              }
              blurOnSubmit={false}
              inputRef={composerRef}
            />
          )}
        </View>
      </KeyboardAvoidingView>
      <MessageContextMenu
        visible={!!messageActionTarget}
        canReact={
          Boolean(messageActionTarget?.platform_message_id) &&
          Boolean(platformCapabilities?.canSendReactions)
        }
        canReply={Boolean(messageActionTarget?.platform_message_id) && Boolean(platformCapabilities?.canReplyToMessages)}
        content={messageActionTarget?.content || ''}
        activeReactionEmojis={(messageActionTarget
          ? reactionsByMessage[messageActionTarget.id] || []
          : [])
          .filter((reaction) => reaction.from_me)
          .map((reaction) => reaction.emoji)}
        onReact={(emoji) => void handleReact(emoji)}
        onDismiss={() => setMessageActionTarget(null)}
        onReply={() => {
          if (!messageActionTarget) return;
          setReplyTarget(messageActionTarget);
          setMessageActionTarget(null);
          requestAnimationFrame(() => composerRef.current?.focus());
        }}
      />
    </SafeAreaView>
  );
}
