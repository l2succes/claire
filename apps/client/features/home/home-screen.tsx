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

interface BriefLoop {
  id: string;
  content: string;
  deadline?: string | null;
  chat_id?: string | null;
  status: string;
  from_me: boolean;
  chat?: { name?: string | null; platform?: string | null; is_group?: boolean | null } | null;
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
    // The Home brief includes overdue commitments too. The previous pending-only
    // request made a real overdue queue disappear from this screen.
    queryFn: () => authJson<BriefLoop[]>('/loops?limit=20'),
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
  const openLoops = (loops.data ?? []).filter(loop => ['open', 'waiting', 'snoozed'].includes(loop.status));
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
      onPress: () => router.push({ pathname: '/chat/[chatId]', params: { chatId: message.chat_id, contact_name: message.contact_name || '', chat_name: message.chat_name || '', platform: message.platform || '', is_group: message.is_group ? '1' : '0', highlightMessageId: message.id } }),
    }; }),
    ...openLoops.slice(0, Math.max(0, 4 - Math.min(urgent.length, 3))).map(loop => ({
      key: `loop-${loop.id}`,
      title: loop.content,
      subtitle: `Loop · ${loop.deadline ? `due ${new Date(loop.deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : 'open'}`,
      platform: undefined,
      time: loop.deadline ? formatInboxTimestamp(loop.deadline) : 'Now',
      kind: 'loop' as const,
      urgent: false,
      onPress: () => loop.chat_id ? router.push({ pathname: '/chat/[chatId]', params: { chatId: loop.chat_id, chat_name: loop.chat?.name || '', platform: loop.chat?.platform || '', is_group: loop.chat?.is_group ? '1' : '0' } }) : router.push('/(tabs)/loops'),
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
