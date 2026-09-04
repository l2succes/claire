import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { CheckCircle2, PenSquare, Pin, Search, Sparkles, X } from 'lucide-react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { colors, mobileType, radius, space, useIsDesktopLayout } from '@claire/design-system';
import { MobileChip, MobileHeader, MobileIconButton, MobileSearchField, MobileState, SectionLabel } from '../../components/mobile/claire-mobile';
import { useInboxMessages, type InboxMessage } from '../../hooks/useInboxMessages';
import { chatTimelineOptions, warmChatTimelines } from '../../hooks/useChatTimeline';
import { useAuthStore } from '../../stores/authStore';
import { usePlatformStore } from '../../stores/platformStore';
import { supabase, type DbRow } from '../../services/supabase';
import { API_BASE_URL } from '../../services/platforms';
import { Platform } from '../../types/platform';
import { PlatformBadge } from '../../components/PlatformIcon';
import { formatInboxTimestamp } from '../../utils/messageTimestamp';
import { InboxRowSkeleton, InboxSkeleton } from '../../components/claire/skeleton';
import { signalFirstPaint } from '../../services/mobile-sync';
import { useScreenLoadMark } from '../../hooks/useScreenLoadMark';

type InboxFilter = 'all' | 'unread' | 'needs_reply' | 'groups';
type PlatformFilter = 'all' | Platform;

const avatarTones = [colors.sky, colors.mint, colors.lavender, colors.blush] as const;

const MEDIA_PREVIEW_LABELS: Record<string, string> = {
  image: 'sent a picture',
  video: 'sent a video',
  audio: 'sent a voice message',
  document: 'sent a file',
  location: 'shared a location',
};

/**
 * The preview line for a media conversation. Bridged attachments usually carry
 * no caption, so the row used to read a bare "Media"; describe what arrived
 * instead, attribute it in a group, and show the picture itself when there is
 * one.
 */
function conversationPreview(message: InboxMessage): { label: string; thumbnailUri?: string } {
  const type = message.content_type || 'text';
  const caption = message.content?.trim();
  const mediaLabel = MEDIA_PREVIEW_LABELS[type];
  // In a group the sender is not the conversation, so name them the way the
  // other messaging clients do: "Juan: sent a picture".
  const speaker = message.is_group && message.sender_name && !message.from_me ? message.sender_name : undefined;
  const thumbnailUri = type === 'image' && message.media_url ? normalizeInboxMediaUrl(message.media_url) : undefined;

  if (!mediaLabel) return { label: caption || 'No messages yet' };
  const body = caption || mediaLabel;
  return { label: speaker ? `${speaker}: ${body}` : body, thumbnailUri };
}

// Attachments are stored as Matrix mxc:// or as a server-relative /media path;
// both need resolving to something the image loader can fetch.
function normalizeInboxMediaUrl(value: string): string | undefined {
  if (value.startsWith('/media/')) return `${API_BASE_URL}${value}`;
  const mxc = value.match(/^mxc:\/\/([^/]+)\/(.+)$/);
  if (mxc) return `${API_BASE_URL}/media/${encodeURIComponent(mxc[1])}/${encodeURIComponent(mxc[2])}`;
  return /^https?:\/\//i.test(value) ? value : undefined;
}

/** Shared conversation content for phone and desktop. The shell owns columns;
 * this row owns identity, platform, media, read state, and preview semantics. */
function InboxConversationRowInner({
  message,
  pinned,
  active = false,
  layout = 'mobile',
  onPress,
  onPressIn,
  onLongPress,
}: {
  message: InboxMessage;
  pinned?: boolean;
  active?: boolean;
  layout?: 'mobile' | 'desktop';
  onPress: () => void;
  /** Fires on touch-down, ahead of navigation — used to warm the transcript. */
  onPressIn?: () => void;
  onLongPress?: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);
  const preview = conversationPreview(message);
  const name = message.chat_name || message.contact_name || 'Unknown conversation';
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '?';
  const tone = avatarTones[[...name].reduce((total, character) => total + character.charCodeAt(0), 0) % avatarTones.length];
  const desktop = layout === 'desktop';
  const rowHeight = pinned ? 92 : desktop ? 68 : 76;
  const inset = pinned ? space[3] : desktop ? 8 : space[4];
  const avatarSize = desktop ? 36 : 44;
  const surface = active ? '#E6F57A' : pinned ? '#FFF8DC' : colors.paper;

  return (
    <Pressable
      testID={`message-card-${message.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${name}${message.unread_count ? `, ${message.unread_count} unread` : ''}`}
      onPress={onPress}
      onPressIn={onPressIn}
      onLongPress={onLongPress}
      style={{
        height: rowHeight,
        marginHorizontal: pinned && !desktop ? space[4] : desktop ? 6 : 0,
        marginTop: pinned ? space[2] : desktop ? 2 : 0,
        marginBottom: desktop ? 2 : 0,
        borderRadius: pinned && !desktop ? 18 : desktop && active ? 12 : 0,
        borderCurve: 'continuous',
        borderWidth: pinned && !desktop ? 1 : 0,
        borderColor: pinned ? '#E5D69A' : 'transparent',
        borderBottomWidth: desktop ? 0 : 1,
        borderBottomColor: pinned ? '#E5D69A' : colors.neutral[200],
        backgroundColor: surface,
        overflow: 'hidden',
      }}
    >
      <View style={{ position: 'absolute', left: inset, top: Math.round((rowHeight - avatarSize) / 2), width: avatarSize, height: avatarSize }}>
        <View style={{ width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2, backgroundColor: tone, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
          {message.contact_avatar && !imageFailed
            ? <Image source={{ uri: message.contact_avatar }} style={{ width: 44, height: 44 }} contentFit="cover" transition={120} onError={() => setImageFailed(true)} />
            : <Text maxFontSizeMultiplier={1} style={{ ...mobileType.label, color: colors.ink }}>{initials}</Text>}
        </View>
        {message.platform ? <View style={{ position: 'absolute', right: -3, bottom: -3, padding: 1, borderRadius: 11, borderWidth: 2, borderColor: surface, backgroundColor: colors.paper }}><PlatformBadge platform={message.platform} size={16} /></View> : null}
      </View>

      <View style={{ position: 'absolute', top: pinned ? 20 : desktop ? 13 : 14, left: inset + avatarSize + (desktop ? 9 : 14), right: inset, gap: desktop ? 1 : 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text maxFontSizeMultiplier={1} selectable numberOfLines={1} style={{ flex: 1, fontFamily: mobileType.body.fontFamily, fontSize: desktop ? 14 : 17, lineHeight: desktop ? 17 : 21, fontWeight: message.unread_count ? '700' : '600', color: colors.ink }}>{name}</Text>
          <Text maxFontSizeMultiplier={1} selectable style={{ fontFamily: mobileType.monoLabel.fontFamily, fontSize: desktop ? 9 : 11, lineHeight: desktop ? 12 : 14, letterSpacing: 0.4, color: colors.neutral[400] }}>{formatInboxTimestamp(message.timestamp)}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {preview.thumbnailUri && !thumbFailed ? (
              <Image
                source={{ uri: preview.thumbnailUri }}
                style={{ width: 26, height: 26, borderRadius: 5, backgroundColor: colors.neutral[100] }}
                contentFit="cover"
                transition={120}
                onError={() => setThumbFailed(true)}
                testID={`inbox-preview-thumb-${message.chat_id}`}
              />
            ) : null}
            <Text maxFontSizeMultiplier={1} selectable numberOfLines={1} style={{ flex: 1, fontFamily: mobileType.body.fontFamily, fontSize: desktop ? 12 : 14, lineHeight: desktop ? 15 : 19, color: colors.neutral[600], fontWeight: message.unread_count ? '500' : '400' }}>{preview.label}</Text>
          </View>
          {(message.has_open_loop || message.unread_count) ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {message.has_open_loop ? <View accessibilityLabel="Open loop in this conversation" style={{ width: desktop ? 18 : 22, height: desktop ? 18 : 22, borderRadius: 11, backgroundColor: colors.blush, alignItems: 'center', justifyContent: 'center' }}><CheckCircle2 size={desktop ? 12 : 15} color={colors.ink} strokeWidth={2.2} /></View> : null}
            {message.unread_count ? <View style={{ minWidth: desktop ? 18 : 22, height: desktop ? 18 : 22, paddingHorizontal: 4, borderRadius: 11, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' }}><Text maxFontSizeMultiplier={1} style={{ ...mobileType.label, fontSize: desktop ? 9 : undefined, color: colors.ink, fontVariant: ['tabular-nums'] }}>{message.unread_count}</Text></View> : null}
          </View> : null}
        </View>
      </View>
    </Pressable>
  );
}

function HighlightCard({ message, onPress }: { message: InboxMessage; onPress: () => void }) {
  const name = message.chat_name || message.contact_name || 'Unknown conversation';
  const reason = message.has_open_loop
    ? 'Open loop'
    : message.has_ai_response
      ? 'Reply ready'
      : message.unread_count
        ? `${message.unread_count} unread`
        : 'Needs a reply';

  return (
    <Pressable testID={`inbox-highlight-${message.id}`} accessibilityRole="button" accessibilityLabel={`${name}. ${reason}`} onPress={onPress} style={{ width: 272 }}>
      <View style={{ minHeight: 138, padding: space[3], gap: space[2], borderRadius: radius.card, borderCurve: 'continuous', borderWidth: 1, borderColor: colors.ink, backgroundColor: colors.sky }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Sparkles size={15} color={colors.ink} />
          <Text maxFontSizeMultiplier={1} style={{ ...mobileType.monoLabel, flex: 1, color: colors.ink }}>CLAIRE'S PICK</Text>
          {message.platform ? <PlatformBadge platform={message.platform} size={16} /> : null}
        </View>
        <View style={{ gap: 2 }}>
          <Text maxFontSizeMultiplier={1} numberOfLines={1} style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>{name}</Text>
          <Text maxFontSizeMultiplier={1} numberOfLines={2} style={{ ...mobileType.bodySmall, color: colors.neutral[800] }}>{message.content || 'Media'}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
          <Text maxFontSizeMultiplier={1} style={{ ...mobileType.label, color: colors.ink }}>{reason}</Text>
          <Text maxFontSizeMultiplier={1} style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>{formatInboxTimestamp(message.timestamp)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

/**
 * Memoised because the feed's identity changes on every realtime patch: the
 * hook re-sorts and returns a new array, which re-rendered every visible row
 * and had each one recompute its initials, avatar tone and preview.
 */
export const InboxConversationRow = memo(InboxConversationRowInner);

export function InboxScreen() {
  const isDesktop = useIsDesktopLayout();
  const params = useLocalSearchParams<{ filter?: string }>();
  const user = useAuthStore(state => state.user);
  const connectedSessions = usePlatformStore(state => state.connectedSessions);
  const [query, setQuery] = useState('');
  // Search runs in the database now, so debounce the term rather than issuing a
  // request per keystroke.
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);
  const [filter, setFilter] = useState<InboxFilter>(params.filter === 'needs_reply' ? 'needs_reply' : 'all');
  const [platform, setPlatform] = useState<PlatformFilter>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [snoozeTarget, setSnoozeTarget] = useState<InboxMessage | null>(null);
  const [locallySnoozed, setLocallySnoozed] = useState<Set<string>>(new Set());

  const inbox = useInboxMessages(user?.id, { search: debouncedQuery, filter, platform });
  const queryClient = useQueryClient();

  // Changing a filter replaces the result set, so bring the viewport with it —
  // otherwise the list stays scrolled where the previous, longer result set
  // left it and the new top rows are off-screen.
  const listRef = useRef<FlatList<InboxMessage>>(null);
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [filter, platform, debouncedQuery]);

  useEffect(() => {
    if (params.filter === 'needs_reply') setFilter('needs_reply');
  }, [params.filter]);

  const loopChats = useQuery({
    queryKey: ['inbox-open-loops', user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('loops').select('chat_id').eq('user_id', user!.id).in('status', ['open', 'waiting', 'snoozed']).not('chat_id', 'is', null);
      if (error) throw error;
      return new Set((data || []).map((row: DbRow) => row.chat_id as string));
    },
  });

  const visibleMessages = useMemo(() => inbox.messages.filter(message => {
    // Snooze is the only local-only concern: an optimistic snooze must hide the
    // row before the server round-trip lands.
    if (locallySnoozed.has(message.id)) return false;
    if (message.snoozed_until && new Date(message.snoozed_until) > new Date()) return false;
    // Platform, unread, needs-reply, groups and the search term are all applied
    // by the query now. Re-applying them here would only ever filter the page
    // already in memory, which is what made them miss most conversations.
    return true;
  }), [inbox.messages, locallySnoozed]);

  const openChat = useCallback((message: InboxMessage) => router.push({
    pathname: '/chat/[chatId]',
    params: { chatId: message.chat_id, contact_name: message.contact_name || '', chat_name: message.chat_name || '', platform: message.platform || '', is_group: message.is_group ? '1' : '0' },
  }), []);

  // Touch-down to navigation commit is a couple of hundred milliseconds of
  // animation that were previously doing nothing. prefetchQuery honours
  // staleTime, so a repeat press or an already-warm chat costs nothing.
  const warmChat = useCallback((message: InboxMessage) => {
    void queryClient.prefetchQuery(chatTimelineOptions(queryClient, user?.id, message.chat_id));
  }, [queryClient, user?.id]);

  // Hold the most recent conversations warm so even a first-ever open has
  // something to paint. Keyed on the first page's identity rather than on every
  // feed update, so scrolling and realtime patches do not re-trigger it.
  const firstPageKey = useMemo(
    () => inbox.messages.slice(0, 12).map(message => message.chat_id).join(','),
    [inbox.messages],
  );
  useEffect(() => {
    if (!user?.id || !firstPageKey) return;
    void warmChatTimelines(queryClient, user.id, firstPageKey.split(','));
  }, [queryClient, user?.id, firstPageKey]);

  const snooze = async (minutes: number) => {
    const target = snoozeTarget;
    if (!target) return;
    setSnoozeTarget(null);
    setLocallySnoozed(current => new Set([...current, target.id]));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`${API_BASE_URL}/messages/${target.id}/snooze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ snooze_minutes: minutes }),
      });
      if (!response.ok) throw new Error('Could not snooze conversation');
    } catch {
      setLocallySnoozed(current => { const next = new Set(current); next.delete(target.id); return next; });
    }
  };

  const togglePin = async () => {
    const target = snoozeTarget;
    if (!target) return;
    setSnoozeTarget(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`${API_BASE_URL}/messages/chats/${target.chat_id}/pin`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ pinned: !target.is_pinned }),
      });
      if (!response.ok) throw new Error('Could not update pin');
      await inbox.fetchMessages();
    } catch (error) {
      console.warn('[Inbox] pin failed', error);
    }
  };

  // Both of these were rebuilt on every render, and the unread count walked the
  // entire loaded feed to do it.
  const filters: Array<{ value: InboxFilter; label: string; count?: number }> = useMemo(() => [
    { value: 'all', label: 'All' },
    { value: 'unread', label: 'Unread', count: inbox.messages.reduce((total, message) => total + (message.unread_count ? 1 : 0), 0) },
    { value: 'needs_reply', label: 'Needs reply' },
  ], [inbox.messages]);
  const platformFilters = useMemo(() => {
    const seen = new Set<string>();
    const options: Array<{ value: PlatformFilter; label: string }> = [];
    for (const session of connectedSessions) {
      if (session.status !== 'connected' || seen.has(session.platform)) continue;
      seen.add(session.platform);
      options.push({
        value: session.platform as PlatformFilter,
        label: session.platform === 'whatsapp' ? 'WhatsApp' : session.platform[0].toUpperCase() + session.platform.slice(1),
      });
    }
    return options;
  }, [connectedSessions]);
  const inboxRows = useMemo(
    () => visibleMessages.map(message => ({ ...message, has_open_loop: loopChats.data?.has(message.chat_id) || message.has_open_loop })),
    [loopChats.data, visibleMessages],
  );
  // Staged startup sync waits on this: the heavy cold-start work belongs
  // behind the first screen the user sees, not in front of it.
  const painted = !inbox.isCold;
  useEffect(() => {
    if (painted) signalFirstPaint();
  }, [painted]);
  useScreenLoadMark('inbox', {
    hasData: painted,
    isFetching: inbox.isFetching,
    source: inbox.localSettled && inbox.isFetching ? 'cache' : 'network',
  });

  const searching = query.trim().length > 0;
  const highlights = useMemo(() => searching ? [] : [...inboxRows]
    .map(message => ({
      message,
      score: (message.has_open_loop ? 8 : 0) + (message.has_ai_response ? 5 : 0) + (message.unread_count ? Math.min(message.unread_count, 4) : 0) + (!message.from_me ? 1 : 0),
    }))
    .filter(candidate => candidate.score > 0)
    .sort((a, b) => b.score - a.score || new Date(b.message.timestamp).getTime() - new Date(a.message.timestamp).getTime())
    .slice(0, 3)
    .map(candidate => candidate.message), [inboxRows, searching]);
  const displayedMessages = inboxRows;
  const renderConversation = useCallback(
    ({ item }: { item: InboxMessage }) => (
      <InboxConversationRow
        message={item}
        onPress={() => openChat(item)}
        onPressIn={() => warmChat(item)}
        onLongPress={() => setSnoozeTarget(item)}
      />
    ),
    [openChat, warmChat],
  );

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([inbox.fetchMessages(), loopChats.refetch()]);
    } finally {
      setIsRefreshing(false);
    }
  }, [inbox.fetchMessages, loopChats]);

  return (
    <View testID="messages-screen" style={{ flex: 1, backgroundColor: colors.paper }}>
      <MobileHeader
        title="Inbox"
        safeArea
        // The header carried a second magnifying glass beside the search field
        // directly below it — two controls, one obvious meaning, different
        // destinations.
        actions={<MobileIconButton label="New message" testID="inbox-compose" onPress={() => router.push('/compose' as never)}><PenSquare size={20} color={colors.ink} /></MobileIconButton>}
      />
      <View style={{ paddingHorizontal: space[4], gap: space[3], paddingBottom: space[3], borderBottomWidth: 1, borderBottomColor: colors.neutral[200] }}>
        <MobileSearchField style={{ minHeight: 46, borderRadius: 13, paddingHorizontal: space[4], backgroundColor: colors.neutral[100] }} inputStyle={{ fontSize: 15, lineHeight: 20 }} icon={<Search size={24} strokeWidth={1.7} color={colors.neutral[600]} />} value={query} onChangeText={setQuery} placeholder="Search conversations" returnKeyType="search" testID="messages-search-input" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: space[4] }}>
          {filters.map(item => <MobileChip key={item.value} label={item.label} count={item.count} active={filter === item.value} onPress={() => setFilter(item.value)} testID={`inbox-filter-${item.value}`} />)}
          {platformFilters.map(item => (
            <MobileChip
              key={item.value}
              label={item.label}
              icon={item.value === 'all' ? undefined : <PlatformBadge platform={item.value} size={14} />}
              active={platform === item.value}
              onPress={() => setPlatform(platform === item.value ? 'all' : item.value)}
              testID={`inbox-platform-${item.value}`}
            />
          ))}
        </ScrollView>
      </View>

      {inbox.isCold ? <InboxSkeleton testID="messages-loading" /> : (
      <FlatList
        ref={listRef}
        testID="messages-list"
        data={displayedMessages}
        keyExtractor={item => item.conversation_key}
        renderItem={renderConversation}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom: 156 }}
        onEndReached={() => {
          // Search results paginate too — the feed is filtered in the database,
          // so there can be more matches beyond the first page.
          if (!displayedMessages.length || !inbox.hasMore || inbox.loadingMore) return;
          void inbox.fetchNextMessages();
        }}
        onEndReachedThreshold={0.4}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void refresh()} tintColor={colors.ink} />}
        ListHeaderComponent={<>
          {highlights.length ? <>
            <View style={{ paddingHorizontal: space[4], paddingTop: space[3], paddingBottom: space[2] }}><SectionLabel title="Highlights" detail="Claire's picks" /></View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space[4], gap: space[3], paddingBottom: space[1] }}>
              {highlights.map(message => <HighlightCard key={message.conversation_key} message={message} onPress={() => openChat(message)} />)}
            </ScrollView>
          </> : null}
          <View style={{ paddingHorizontal: space[4], paddingTop: highlights.length ? space[4] : space[3], paddingBottom: space[1] }}><SectionLabel title="Recent" detail={`${displayedMessages.length} conversations`} /></View>
        </>}
        ListFooterComponent={!searching && inbox.loadingMore ? <InboxRowSkeleton /> : null}
        ListEmptyComponent={inboxRows.length ? null : <MobileState error={!!inbox.error} title={inbox.error ? "Couldn't load the inbox" : 'No conversations here'} message={inbox.error ? 'Pull to retry. Your cached conversations will remain available while Claire reconnects.' : searching ? 'No conversations match that search.' : 'Try another filter or connect a messaging account.'} />}
      />
      )}

      {/* The header already carries a compose action. On a phone the floating
          button is the reachable one; on desktop it would just be a second
          control for the same thing, sitting over the conversation list. */}
      {isDesktop ? null : (
      <Pressable
        testID="inbox-floating-compose"
        accessibilityRole="button"
        accessibilityLabel="New message"
        onPress={() => router.push('/compose' as never)}
        style={({ pressed }) => ({
          position: 'absolute',
          right: space[5],
          bottom: 92,
          width: 54,
          height: 54,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.ink,
          opacity: pressed ? 0.72 : 1,
          shadowColor: colors.ink,
          shadowOpacity: 0.18,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
          elevation: 5,
        })}
      >
        <PenSquare size={24} color={colors.paper} />
      </Pressable>
      )}

      <Modal visible={!!snoozeTarget} transparent animationType="fade" onRequestClose={() => setSnoozeTarget(null)} testID="snooze-modal">
        <Pressable testID="snooze-modal-overlay" onPress={() => setSnoozeTarget(null)} style={{ flex: 1, backgroundColor: 'rgba(16,18,15,0.35)', justifyContent: 'flex-end' }}>
          <Pressable style={{ backgroundColor: colors.paper, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: space[5], paddingBottom: 36, gap: space[2] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}><Text selectable style={{ ...mobileType.sectionTitle, flex: 1, color: colors.ink }}>Conversation actions</Text><MobileIconButton label="Close" onPress={() => setSnoozeTarget(null)}><X size={19} color={colors.ink} /></MobileIconButton></View>
            <Pressable testID="inbox-toggle-pin" onPress={() => void togglePin()} style={({ pressed }) => ({ minHeight: 48, paddingHorizontal: space[4], flexDirection: 'row', alignItems: 'center', gap: space[3], borderRadius: radius.control, backgroundColor: pressed ? colors.sky : colors.cream })}><Pin size={17} color={colors.ink} /><Text style={{ ...mobileType.body, color: colors.ink }}>{snoozeTarget?.is_pinned ? 'Unpin from top' : 'Pin to top'}</Text></Pressable>
            <Text style={{ ...mobileType.monoLabel, color: colors.neutral[400], paddingHorizontal: space[2], paddingTop: space[2] }}>SNOOZE</Text>
            {[{ label: 'Later today', minutes: 180, id: 'snooze-option-3h' }, { label: 'Tomorrow morning', minutes: 24 * 60, id: 'snooze-option-tomorrow' }, { label: 'Next week', minutes: 7 * 24 * 60, id: 'snooze-option-week' }].map(option => (
              <Pressable key={option.id} testID={option.id} onPress={() => void snooze(option.minutes)} style={({ pressed }) => ({ minHeight: 48, paddingHorizontal: space[4], justifyContent: 'center', borderRadius: radius.control, backgroundColor: pressed ? colors.neutral[100] : colors.cream })}><Text style={{ ...mobileType.body, color: colors.ink }}>{option.label}</Text></Pressable>
            ))}
            <Pressable testID="snooze-cancel" onPress={() => setSnoozeTarget(null)} style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}><Text style={{ ...mobileType.body, color: colors.neutral[600] }}>Cancel</Text></Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
