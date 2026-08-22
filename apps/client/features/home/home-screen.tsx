import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { AlertCircle, ArrowUpRight, CheckCircle2, MessageCircle, Settings, Sparkles } from 'lucide-react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { colors, mobileType, radius, space } from '@claire/design-system';
import { MobileAvatar, MobileHeader, MobileIconButton, MobileState, SectionLabel } from '../../components/mobile/claire-mobile';
import { PlatformIcon } from '../../components/PlatformIcon';
import { useAuthStore } from '../../stores/authStore';
import { useInboxMessages } from '../../hooks/useInboxMessages';
import { supabase } from '../../services/supabase';
import { API_BASE_URL } from '../../services/platforms';
import { resolvePlatform, platformLabel } from '../../types/platform';
import { formatInboxTimestamp } from '../../utils/messageTimestamp';
import { computeUrgencyScore } from '../../utils/urgency';
import { HomeSkeleton } from '../../components/claire/skeleton';
import { installationId, listHandoffs, type WorkspaceHandoff } from '../../services/handoffs';
import { loopTitle, type LoopItem } from '../../services/loops';

interface UrgentMessage {
  id: string;
  chat_id: string;
  contact_name?: string;
  chat_name?: string;
  content: string;
  timestamp: string;
  platform?: string;
  is_group: boolean;
}

interface MorningBriefData {
  brief_text: string;
  urgent_messages: UrgentMessage[];
}

const HOME_LOOP_SELECT = 'id, content, title, state_summary, deadline, chat_id, status, from_me, owner, priority_score, chat:chats!loops_chat_id_fkey(name, platform, is_group)';

async function fetchHomeLoops(userId: string): Promise<LoopItem[]> {
  const { data, error } = await supabase.from('loops').select(HOME_LOOP_SELECT).eq('user_id', userId)
    .in('status', ['open', 'waiting']).order('priority_score', { ascending: false, nullsFirst: false }).order('last_evidence_at', { ascending: false, nullsFirst: false }).limit(20);
  if (error) throw error;
  return (data ?? []) as LoopItem[];
}

async function authJson<T>(path: string): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
  });
  const body = await response.json().catch(() => ({})) as { data?: T; error?: string };
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body.data as T;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function HomeScreen() {
  const user = useAuthStore(state => state.user);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const inbox = useInboxMessages(user?.id);
  const brief = useQuery({
    queryKey: ['mobile-home-brief', user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: () => authJson<MorningBriefData>('/ai/morning-brief'),
  });
  const loops = useQuery({
    queryKey: ['mobile-home-loops', user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: () => fetchHomeLoops(user!.id),
  });
  const handoffs = useQuery({
    queryKey: ['workspace-handoffs', user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return null;
      const ownInstallation = await installationId();
      return (await listHandoffs(session.access_token)).find((handoff) => handoff.installation_id !== ownInstallation) || null;
    },
  });

  const firstName = user?.name?.trim().split(/\s+/)[0] || user?.email?.split('@')[0] || 'there';
  const inboxUrgent = useMemo(() => inbox.messages
    .filter(message => !message.from_me)
    .map(message => ({
      id: message.id,
      chat_id: message.chat_id,
      contact_name: message.contact_name,
      chat_name: message.chat_name,
      content: message.content,
      timestamp: message.timestamp,
      platform: message.platform,
      is_group: message.is_group,
      score: (message.unread_count || 0) > 0
        ? 100
        : computeUrgencyScore({ timestamp: message.timestamp, from_me: message.from_me, content: message.content }),
    }))
    .filter(message => message.score >= 30)
    .sort((a, b) => b.score - a.score || new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 5), [inbox.messages]);
  // The server brief is a useful ranking enhancement, but the synced inbox is
  // canonical on-device. Falling back here keeps Home useful during a deploy,
  // while offline after cached data loads, or when AI is unavailable.
  const urgent = brief.data?.urgent_messages?.length ? brief.data.urgent_messages : inboxUrgent;
  const openLoops = loops.data ?? [];
  const focusLoops = openLoops.filter(loop => (loop.priority_score ?? 0) >= 55).slice(0, 5);
  const actionCount = urgent.length + openLoops.length;
  const defaultBrief = actionCount
    ? `${actionCount} item${actionCount === 1 ? '' : 's'} need${actionCount === 1 ? 's' : ''} your attention${urgent[0] ? ` — starting with ${urgent[0].contact_name || urgent[0].chat_name || 'a conversation'}.` : '.'}`
    : 'Your priorities will settle here as conversations sync.';
  const dayItems = useMemo(() => [
    ...urgent.slice(0, 3).map(message => {
      const person = message.contact_name || message.chat_name || 'Someone';
      const content = message.content?.trim() || '';
      return {
      key: `message-${message.id}`,
      title: /(?:https?:\/\/|www\.)/i.test(content) ? `${person} shared a link` : content || `${person} needs a reply`,
      subtitle: `${platformLabel(message.platform, 'Message')} · ${person}`,
      platform: resolvePlatform(message.platform),
      time: formatInboxTimestamp(message.timestamp),
      kind: 'message' as const,
      urgent: 'score' in message && typeof message.score === 'number' && message.score >= 70,
      // No highlightMessageId: these rows are always a conversation's newest
      // message, so it is already the last bubble. Ringing it in focus blue
      // marks the obvious and reads as an unexplained state. The highlight is
      // for search results and assistant citations, where the message is buried
      // in history and the reader needs to be told which one they were sent to.
      onPress: () => router.push({ pathname: '/chat/[chatId]', params: { chatId: message.chat_id, contact_name: message.contact_name || '', chat_name: message.chat_name || '', platform: message.platform || '', is_group: message.is_group ? '1' : '0' } }),
    }; }),
    ...openLoops.slice(0, Math.max(0, 4 - Math.min(urgent.length, 3))).map(loop => ({
      key: `loop-${loop.id}`,
      title: loopTitle(loop),
      subtitle: `${loop.owner === 'them' ? 'Waiting on them' : loop.owner === 'me' ? 'You owe this' : 'Loop'} · ${loop.deadline ? `due ${new Date(loop.deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : 'open'}`,
      platform: undefined,
      time: loop.deadline ? formatInboxTimestamp(loop.deadline) : 'Now',
      kind: 'loop' as const,
      urgent: false,
      onPress: () => router.push({ pathname: '/loops/[id]', params: { id: loop.id } }),
    })),
  ].slice(0, 3), [openLoops, urgent]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([brief.refetch(), loops.refetch(), inbox.fetchMessages()]);
    } finally {
      setIsRefreshing(false);
    }
  }, [brief, inbox, loops]);

  return (
    <ScrollView
      testID="home-screen"
      style={{ flex: 1, backgroundColor: colors.cream }}
      contentInsetAdjustmentBehavior="never"
      contentContainerStyle={{ paddingBottom: 112 }}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void refresh()} tintColor={colors.ink} />}
    >
      <MobileHeader
        eyebrow={new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
        title={`${greeting()},\n${firstName}.`}
        subtitle={actionCount === 0 ? "You're clear right now." : `${actionCount} item${actionCount === 1 ? '' : 's'} need${actionCount === 1 ? 's' : ''} your attention.`}
        safeArea
        profile={
          <Pressable accessibilityRole="button" accessibilityLabel="Open settings" onPress={() => router.push('/settings')}>
            <MobileAvatar name={user?.name || user?.email || 'You'} uri={user?.avatar_url} size={44} badge={<View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: colors.lime, borderWidth: 2, borderColor: colors.cream }} />} />
          </Pressable>
        }
      />

      <View style={{ paddingHorizontal: space[4], gap: space[4] }}>
        {(brief.isLoading && inbox.loading) || loops.isLoading ? (
          <HomeSkeleton />
        ) : (
          <>
        <Pressable
          testID="home-needs-reply"
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/(tabs)/messages', params: { filter: 'needs_reply' } })}
          style={({ pressed }) => ({ width: '100%', opacity: pressed ? 0.78 : 1 })}
        >
          <View style={{ width: '100%', minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[3], borderRadius: radius.card, borderCurve: 'continuous', borderWidth: 1, borderColor: colors.ink, backgroundColor: colors.lime }}>
            <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}><ArrowUpRight size={22} color={colors.paper} /></View>
            <View style={{ flex: 1, justifyContent: 'center', gap: 2 }}>
              <Text selectable style={{ ...mobileType.monoLabel, color: colors.ink }}>NEEDS A REPLY</Text>
              <Text selectable style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>{urgent.length} conversation{urgent.length === 1 ? '' : 's'} waiting</Text>
            </View>
            <Text style={{ ...mobileType.label, color: colors.ink }}>View</Text>
          </View>
        </Pressable>

        {handoffs.data ? <ContinueElsewhere handoff={handoffs.data} /> : null}

        <View style={{ padding: space[4], backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.neutral[200], borderRadius: radius.card, gap: space[3] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}><Text style={{ ...mobileType.monoLabel, color: colors.ink }}>FOCUS</Text><Text style={{ ...mobileType.bodySmall, flex: 1, color: colors.neutral[600] }}>{focusLoops.length} loop{focusLoops.length === 1 ? '' : 's'} worth attention</Text><Pressable onPress={() => router.push('/(tabs)/loops')}><Text style={{ ...mobileType.bodySmall, fontWeight: '700', color: colors.ink }}>All loops</Text></Pressable></View>
          {focusLoops.length ? focusLoops.slice(0, 3).map(loop => <Pressable key={loop.id} onPress={() => router.push({ pathname: '/loops/[id]', params: { id: loop.id } })} style={{ paddingTop: space[3], borderTopWidth: 1, borderTopColor: colors.neutral[200], flexDirection: 'row', gap: space[3] }}><View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: (loop.priority_score ?? 0) >= 80 ? colors.danger : colors.ink, backgroundColor: (loop.priority_score ?? 0) >= 80 ? colors.blush : colors.paper }} /><View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>{loopTitle(loop)}</Text><Text numberOfLines={1} style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{loop.owner === 'them' ? 'Waiting on them' : 'You owe this'}{loop.deadline ? ` · ${new Date(loop.deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}</Text></View><Text style={{ ...mobileType.monoLabel, color: (loop.priority_score ?? 0) >= 80 ? colors.danger : colors.neutral[600] }}>{(loop.priority_score ?? 0) >= 80 ? 'ACT NOW' : ''}</Text></Pressable>) : <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>Your loops are quiet right now.</Text>}
        </View>

        <SectionLabel title="Your day" detail={`${dayItems.length} items`} />
        {dayItems.length === 0 ? (
          <MobileState title="A calm day" message="New messages and open loops that need attention will appear here." />
        ) : (
          <View>
            {dayItems.map(item => (
              <Pressable key={item.key} onPress={item.onPress} style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 82, paddingVertical: space[3], borderBottomWidth: 1, borderBottomColor: colors.neutral[200] }}>
                  <View style={{ width: 48, height: 48, flexShrink: 0, borderRadius: 16, backgroundColor: item.kind === 'loop' ? colors.sky : item.urgent ? colors.blush : colors.sky, alignItems: 'center', justifyContent: 'center' }}>
                    {item.kind === 'loop' ? <CheckCircle2 size={23} color={colors.ink} /> : item.urgent ? <AlertCircle size={23} color={colors.ink} /> : <MessageCircle size={22} color={colors.ink} />}
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                    <Text selectable numberOfLines={1} style={{ ...mobileType.body, fontWeight: '800', color: colors.ink }}>{item.title}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {item.platform ? <PlatformIcon platform={item.platform} size={14} /> : null}
                      <Text selectable numberOfLines={1} style={{ flex: 1, ...mobileType.bodySmall, color: colors.neutral[600] }}>{item.subtitle}</Text>
                    </View>
                  </View>
                  <Text selectable numberOfLines={1} style={{ width: 42, textAlign: 'right', ...mobileType.monoLabel, color: colors.neutral[600] }}>{item.time}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: space[3], padding: space[4], backgroundColor: colors.sky, borderRadius: radius.card, borderCurve: 'continuous' }}>
          <Sparkles size={21} color={colors.ink} />
          <View style={{ flex: 1, gap: 3 }}>
            <Text selectable style={{ ...mobileType.monoLabel, color: colors.ink }}>CLAIRE'S TAKE</Text>
            <Text selectable style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>{brief.data?.brief_text || defaultBrief}</Text>
          </View>
          <MobileIconButton label="Open settings" onPress={() => router.push('/settings')}><Settings size={18} color={colors.ink} /></MobileIconButton>
        </View>
          </>
        )}
      </View>
    </ScrollView>
  );
}

function ContinueElsewhere({ handoff }: { handoff: WorkspaceHandoff }) {
  const route = handoff.payload.route || (handoff.payload.chatId ? `/chat/${handoff.payload.chatId}` : '/(tabs)/dashboard');
  return <Pressable accessibilityRole="button" onPress={() => router.push(route as never)} style={({ pressed }) => ({ opacity: pressed ? 0.76 : 1 })} testID="continue-handoff">
    <View style={{ padding: space[3], gap: 4, borderRadius: radius.card, borderWidth: 1, borderColor: colors.neutral[200], backgroundColor: colors.paper }}>
      <Text style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>CONTINUE FROM {handoff.source_platform.toUpperCase()}</Text>
      <Text style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>Pick up where you left off</Text>
      <Text numberOfLines={1} style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{handoff.payload.draft ? 'Your draft is ready to continue.' : 'Restore your recent workspace context.'}</Text>
    </View>
  </Pressable>;
}
