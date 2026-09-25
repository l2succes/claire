import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { AlertCircle, MessageCircle } from 'lucide-react-native';
import { router } from 'expo-router';

import { colors, mobileType, radius, space } from '@claire/design-system';
import { MobileAvatar, MobileHeader, SectionLabel } from '../../components/mobile/claire-mobile';
import { FeedbackPressable } from '../../components/mobile/pressable-feedback';
import { PlatformIcon } from '../../components/PlatformIcon';
import { useAuthStore } from '../../stores/authStore';
import { useInboxMessages } from '../../hooks/useInboxMessages';
import { supabase } from '../../services/supabase';
import { resolvePlatform, platformLabel } from '../../types/platform';
import { formatInboxTimestamp } from '../../utils/messageTimestamp';
import { computeUrgencyScore } from '../../utils/urgency';
import { HomeSkeleton } from '../../components/claire/skeleton';
import { loopTitle, type LoopItem } from '../../services/loops';
import { cachedLoops } from '../../services/mobile-cache';
import { useLocalFirstQuery } from '../../hooks/useLocalFirstQuery';
import { useScreenLoadMark } from '../../hooks/useScreenLoadMark';
import { belongsInHomeLoops } from '../../services/loop-query-cache';
import { NotificationBell } from './notification-bell';
import { FollowUpStatusCard } from './follow-up-status-card';

const HOME_LOOP_SELECT = 'id, content, title, state_summary, deadline, chat_id, status, from_me, owner, priority_score, chat:chats!loops_chat_id_fkey(name, platform, is_group)';

async function fetchHomeLoops(userId: string): Promise<LoopItem[]> {
  const { data, error } = await supabase.from('loops').select(HOME_LOOP_SELECT).eq('user_id', userId)
    .in('status', ['open', 'waiting']).order('priority_score', { ascending: false, nullsFirst: false }).order('last_evidence_at', { ascending: false, nullsFirst: false }).limit(20);
  if (error) throw error;
  return (data ?? []) as LoopItem[];
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
  const loops = useLocalFirstQuery({
    queryKey: ['mobile-home-loops', user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: () => fetchHomeLoops(user!.id),
    local: {
      enabled: !!user?.id,
      read: async () => user?.id
        ? ((await cachedLoops(user.id)) as unknown as LoopItem[]).filter(belongsInHomeLoops)
        : null,
    },
  });

  useScreenLoadMark('home', {
    hasData: !(inbox.isCold && loops.isCold),
    isFetching: loops.isFetching || inbox.isFetching,
    source: loops.isFetching ? 'cache' : 'network',
  });

  const firstName = user?.name?.trim().split(/\s+/)[0];
  const greetingTitle = firstName ? `${greeting()}, ${firstName}` : greeting();
  const inboxUrgent = useMemo(() => inbox.messages
    // A read badge is not evidence that a conversation still needs attention:
    // provider-side reads can arrive later than the message itself. Keep this
    // section recent and let the Inbox own the exact unread state.
    .filter(message => !message.from_me && Date.now() - new Date(message.timestamp).getTime() < 48 * 60 * 60 * 1000)
    .map(message => ({
      id: message.id,
      chat_id: message.chat_id,
      contact_name: message.contact_name,
      chat_name: message.chat_name,
      content: message.content,
      timestamp: message.timestamp,
      platform: message.platform,
      is_group: message.is_group,
      score: computeUrgencyScore({ timestamp: message.timestamp, from_me: message.from_me, content: message.content }),
    }))
    .filter(message => message.score >= 30)
    .sort((a, b) => b.score - a.score || new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 5), [inbox.messages]);
  // Live inbox data is the source for rows; an opaque AI snapshot may still
  // refer to a chat that was read on another device.
  const urgent = inboxUrgent;
  // Memoised: these were recomputed on every render, including every render
  // caused by a realtime message patch.
  const openLoops = useMemo(() => (loops.data ?? []).filter(belongsInHomeLoops), [loops.data]);
  const focusLoops = useMemo(
    () => openLoops.filter(loop => (loop.priority_score ?? 0) >= 55).slice(0, 5),
    [openLoops],
  );
  const dayItems = useMemo(() =>
    urgent.slice(0, 3).map(message => {
      const person = message.contact_name || message.chat_name || 'Someone';
      const content = message.content?.trim() || '';
      return {
      key: `message-${message.id}`,
      title: /(?:https?:\/\/|www\.)/i.test(content) ? `${person} shared a link` : content || `${person} needs a reply`,
      subtitle: `${platformLabel(message.platform, 'Message')} · ${person}`,
      platform: resolvePlatform(message.platform),
      time: formatInboxTimestamp(message.timestamp),
      urgent: 'score' in message && typeof message.score === 'number' && message.score >= 70,
      // No highlightMessageId: these rows are always a conversation's newest
      // message, so it is already the last bubble. Ringing it in focus blue
      // marks the obvious and reads as an unexplained state. The highlight is
      // for search results and assistant citations, where the message is buried
      // in history and the reader needs to be told which one they were sent to.
      onPress: () => router.push({ pathname: '/chat/[chatId]', params: { chatId: message.chat_id, contact_name: message.contact_name || '', chat_name: message.chat_name || '', platform: message.platform || '', is_group: message.is_group ? '1' : '0' } }),
    }; }), [urgent]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([loops.refetch(), inbox.fetchMessages()]);
    } finally {
      setIsRefreshing(false);
    }
  }, [inbox, loops]);

  return (
    <ScrollView
      testID="home-screen"
      style={{ flex: 1, backgroundColor: colors.cream }}
      contentInsetAdjustmentBehavior="never"
      contentContainerStyle={{ paddingBottom: 112 }}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void refresh()} tintColor={colors.ink} />}
    >
      <MobileHeader
        title={greetingTitle}
        titleNumberOfLines={1}
        titleStyle={{ fontSize: 26, lineHeight: 30, letterSpacing: -0.6 }}
        actions={<NotificationBell />}
        profile={
          <Pressable accessibilityRole="button" accessibilityLabel="Open profile" onPress={() => router.navigate('/(tabs)/settings')}>
            <MobileAvatar name={user?.name || user?.email || 'You'} uri={user?.avatar_url} size={44} badge={<View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: colors.lime, borderWidth: 2, borderColor: colors.cream }} />} />
          </Pressable>
        }
      />

      <View style={{ paddingHorizontal: space[4], gap: space[4] }}>
        <FollowUpStatusCard />
        {inbox.isCold && loops.isCold ? (
          <HomeSkeleton />
        ) : (
          <>
        <View style={{ padding: space[4], backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.neutral[200], borderRadius: radius.card, gap: space[3] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}><Text style={{ ...mobileType.monoLabel, color: colors.ink }}>FOCUS</Text><Text style={{ ...mobileType.bodySmall, flex: 1, color: colors.neutral[600] }}>{focusLoops.length} loop{focusLoops.length === 1 ? '' : 's'} worth attention</Text><Pressable onPress={() => router.push('/(tabs)/loops')}><Text style={{ ...mobileType.bodySmall, fontWeight: '700', color: colors.ink }}>All loops</Text></Pressable></View>
          {focusLoops.length ? focusLoops.slice(0, 3).map(loop => <Pressable key={loop.id} onPress={() => router.push({ pathname: '/loops/[id]', params: { id: loop.id } })} style={{ paddingTop: space[3], borderTopWidth: 1, borderTopColor: colors.neutral[200], flexDirection: 'row', gap: space[3] }}><View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: (loop.priority_score ?? 0) >= 80 ? colors.danger : colors.ink, backgroundColor: (loop.priority_score ?? 0) >= 80 ? colors.blush : colors.paper }} /><View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>{loopTitle(loop)}</Text><Text numberOfLines={1} style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{loop.owner === 'them' ? 'Waiting on them' : 'You owe this'}{loop.deadline ? ` · ${new Date(loop.deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}</Text></View><Text style={{ ...mobileType.monoLabel, color: (loop.priority_score ?? 0) >= 80 ? colors.danger : colors.neutral[600] }}>{(loop.priority_score ?? 0) >= 80 ? 'ACT NOW' : ''}</Text></Pressable>) : <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>Your loops are quiet right now.</Text>}
        </View>

        {dayItems.length > 0 ? <>
          <SectionLabel title="Recent conversations" detail={`${dayItems.length} recent`} />
          <View>
            {dayItems.map(item => (
              <FeedbackPressable key={item.key} onPress={item.onPress} style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 82, paddingVertical: space[3], borderBottomWidth: 1, borderBottomColor: colors.neutral[200] }}>
                  <View style={{ width: 48, height: 48, flexShrink: 0, borderRadius: 16, backgroundColor: item.urgent ? colors.blush : colors.sky, alignItems: 'center', justifyContent: 'center' }}>
                    {item.urgent ? <AlertCircle size={23} color={colors.ink} /> : <MessageCircle size={22} color={colors.ink} />}
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
              </FeedbackPressable>
            ))}
          </View>
        </> : null}

        <FeedbackPressable accessibilityRole="button" accessibilityLabel="Ask Claire what needs attention next" onPress={() => router.push('/(tabs)/ask-claire')} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
          <View style={{ flexDirection: 'row', gap: space[3], padding: space[4], backgroundColor: colors.sky, borderRadius: radius.card, borderCurve: 'continuous' }}>
            <MessageCircle size={21} color={colors.ink} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ ...mobileType.monoLabel, color: colors.ink }}>ASK CLAIRE</Text>
              <Text style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>What deserves my attention next?</Text>
            </View>
          </View>
        </FeedbackPressable>
          </>
        )}
      </View>
    </ScrollView>
  );
}
