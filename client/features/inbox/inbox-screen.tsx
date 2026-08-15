import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Plus, Search, UsersRound, X } from 'lucide-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { colors, mobileType, radius, space } from '@claire/design-system';
import { MessageCard } from '../../components/MessageCard';
import { MobileChip, MobileHeader, MobileIconButton, MobileSearchField, MobileState } from '../../components/mobile/claire-mobile';
import { UnifiedUpdatesRail, type UnifiedUpdateContact } from '../../components/UnifiedUpdatesRail';
import { useInboxMessages, type InboxMessage } from '../../hooks/useInboxMessages';
import { useAuthStore } from '../../stores/authStore';
import { usePlatformStore } from '../../stores/platformStore';
import { supabase } from '../../services/supabase';
import { API_BASE_URL } from '../../services/platforms';
import { Platform } from '../../types/platform';

type InboxFilter = 'all' | 'unread' | 'needs_reply' | 'groups';
type PlatformFilter = 'all' | Platform;

export function InboxScreen() {
  const params = useLocalSearchParams<{ filter?: string }>();
  const user = useAuthStore(state => state.user);
  const connectedSessions = usePlatformStore(state => state.connectedSessions);
  const inbox = useInboxMessages(user?.id);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<InboxFilter>(params.filter === 'needs_reply' ? 'needs_reply' : 'all');
  const [platform, setPlatform] = useState<PlatformFilter>('all');
  const [snoozeTarget, setSnoozeTarget] = useState<InboxMessage | null>(null);
  const [locallySnoozed, setLocallySnoozed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (params.filter === 'needs_reply') setFilter('needs_reply');
  }, [params.filter]);

  const promiseChats = useQuery({
    queryKey: ['inbox-open-promises', user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('promises').select('chat_id').eq('user_id', user!.id).in('status', ['pending', 'open']).not('chat_id', 'is', null);
      if (error) throw error;
      return new Set((data || []).map(row => row.chat_id as string));
    },
  });

  const updates = useQuery({
    queryKey: ['inbox-update-contacts', user?.id],
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`${API_BASE_URL}/contacts`, { headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {} });
      if (!response.ok) return [];
      const body = await response.json() as { success?: boolean; contacts?: UnifiedUpdateContact[] };
      return body.success && Array.isArray(body.contacts) ? body.contacts.slice(0, 18) : [];
    },
  });

  const visibleMessages = useMemo(() => inbox.messages.filter(message => {
    if (locallySnoozed.has(message.id)) return false;
    if (message.snoozed_until && new Date(message.snoozed_until) > new Date()) return false;
    if (platform !== 'all' && message.platform !== platform) return false;
    if (filter === 'unread' && !message.unread_count) return false;
    if (filter === 'needs_reply' && message.from_me) return false;
    if (filter === 'groups' && !message.is_group) return false;
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return true;
    return [message.chat_name, message.contact_name, message.contact_phone, message.content].some(value => value?.toLowerCase().includes(normalizedQuery));
  }), [filter, inbox.messages, locallySnoozed, platform, query]);

  const openChat = useCallback((message: InboxMessage) => router.push({
    pathname: '/chat/[chatId]',
    params: { chatId: message.chat_id, contact_name: message.contact_name || '', chat_name: message.chat_name || '', platform: message.platform || '', is_group: message.is_group ? '1' : '0' },
  }), []);

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

  const filters: Array<{ value: InboxFilter; label: string; count?: number }> = [
    { value: 'all', label: 'All' },
    { value: 'unread', label: 'Unread', count: inbox.messages.filter(message => !!message.unread_count).length },
    { value: 'needs_reply', label: 'Needs reply', count: inbox.messages.filter(message => !message.from_me).length },
    { value: 'groups', label: 'Groups' },
  ];
  const platformFilterOptions: Array<{ value: PlatformFilter; label: string }> = [
    { value: 'all' as const, label: 'Everywhere' },
    ...connectedSessions.filter(session => session.status === 'connected').map(session => ({ value: session.platform as PlatformFilter, label: session.platform[0].toUpperCase() + session.platform.slice(1) })),
  ];
  const platformFilters = platformFilterOptions.filter((entry, index, rows) => rows.findIndex(candidate => candidate.value === entry.value) === index);

  if (inbox.loading) return <View testID="messages-loading" style={{ flex: 1, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={colors.ink} /></View>;

  return (
    <View testID="messages-screen" style={{ flex: 1, backgroundColor: colors.cream }}>
      <MobileHeader
        title="Inbox"
        subtitle="Every conversation, one calm list."
        actions={<View style={{ flexDirection: 'row', gap: space[2] }}>
          <MobileIconButton label="People" testID="inbox-open-people" onPress={() => router.push('/(tabs)/contacts')}><UsersRound size={20} color={colors.ink} /></MobileIconButton>
          <MobileIconButton label="New message" testID="inbox-compose" onPress={() => router.push('/compose' as never)}><Plus size={21} color={colors.ink} /></MobileIconButton>
        </View>}
      />
      <View style={{ paddingHorizontal: space[4], gap: space[3], paddingBottom: space[3], borderBottomWidth: 1, borderBottomColor: colors.neutral[200] }}>
        <MobileSearchField icon={<Search size={18} color={colors.neutral[600]} />} value={query} onChangeText={setQuery} placeholder="Search conversations" returnKeyType="search" testID="messages-search-input" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>
          {filters.map(item => <MobileChip key={item.value} label={item.label} count={item.count} active={filter === item.value} onPress={() => setFilter(item.value)} testID={`inbox-filter-${item.value}`} />)}
        </ScrollView>
        {platformFilters.length > 1 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>
          {platformFilters.map(item => <MobileChip key={item.value} label={item.label} active={platform === item.value} onPress={() => setPlatform(item.value)} />)}
        </ScrollView> : null}
      </View>

      <FlatList
        testID="messages-list"
        data={visibleMessages}
        keyExtractor={item => item.conversation_key}
        renderItem={({ item }) => <MessageCard message={{ ...item, has_open_promise: promiseChats.data?.has(item.chat_id) }} onPress={() => openChat(item)} onLongPress={() => setSnoozeTarget(item)} />}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom: 104 }}
        maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 1 }}
        onEndReached={() => { if (inbox.hasMore && !inbox.loadingMore) void inbox.fetchNextMessages(); }}
        onEndReachedThreshold={0.5}
        refreshControl={<RefreshControl refreshing={inbox.isRefetching} onRefresh={() => void Promise.all([inbox.fetchMessages(), updates.refetch(), promiseChats.refetch()])} tintColor={colors.ink} />}
        ListHeaderComponent={updates.data?.length ? <UnifiedUpdatesRail contacts={updates.data} ownAvatarUrl={user?.avatar_url} /> : null}
        ListFooterComponent={inbox.loadingMore ? <View style={{ padding: space[4] }}><ActivityIndicator color={colors.ink} /></View> : null}
        ListEmptyComponent={<MobileState error={!!inbox.error} title={inbox.error ? "Couldn't load the inbox" : 'No conversations here'} message={inbox.error ? 'Pull to retry. Your cached conversations will remain available while Claire reconnects.' : 'Try another filter or connect a messaging account.'} />}
      />

      <Modal visible={!!snoozeTarget} transparent animationType="fade" onRequestClose={() => setSnoozeTarget(null)} testID="snooze-modal">
        <Pressable testID="snooze-modal-overlay" onPress={() => setSnoozeTarget(null)} style={{ flex: 1, backgroundColor: 'rgba(16,18,15,0.35)', justifyContent: 'flex-end' }}>
          <Pressable style={{ backgroundColor: colors.paper, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: space[5], paddingBottom: 36, gap: space[2] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}><Text selectable style={{ ...mobileType.sectionTitle, flex: 1, color: colors.ink }}>Snooze conversation</Text><MobileIconButton label="Close" onPress={() => setSnoozeTarget(null)}><X size={19} color={colors.ink} /></MobileIconButton></View>
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
