import { useMemo } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { ArrowUpRight, CheckCircle2, Clock3, MessageCircle, Settings, Sparkles } from 'lucide-react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { colors, mobileType, radius, space } from '@claire/design-system';
import { MobileAvatar, MobileHeader, MobileIconButton, MobileState, SectionLabel } from '../../components/mobile/claire-mobile';
import { useAuthStore } from '../../stores/authStore';
import { useInboxMessages } from '../../hooks/useInboxMessages';
import { supabase } from '../../services/supabase';
import { API_BASE_URL } from '../../services/platforms';
import { formatInboxTimestamp } from '../../utils/messageTimestamp';

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

interface BriefPromise {
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
  const inbox = useInboxMessages(user?.id);
  const brief = useQuery({
    queryKey: ['mobile-home-brief', user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: () => authJson<MorningBriefData>('/ai/morning-brief'),
  });
  const promises = useQuery({
    queryKey: ['mobile-home-promises', user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: () => authJson<BriefPromise[]>('/promises?status=pending&limit=20'),
  });

  const firstName = user?.name?.trim().split(/\s+/)[0] || user?.email?.split('@')[0] || 'there';
  const urgent = brief.data?.urgent_messages ?? [];
  const openPromises = promises.data ?? [];
  const dayItems = useMemo(() => [
    ...urgent.slice(0, 3).map(message => ({
      key: `message-${message.id}`,
      title: message.contact_name || message.chat_name || 'Conversation',
      subtitle: message.content,
      meta: `${message.platform || 'Message'} · ${formatInboxTimestamp(message.timestamp)}`,
      kind: 'message' as const,
      onPress: () => router.push({ pathname: '/chat/[chatId]', params: { chatId: message.chat_id, contact_name: message.contact_name || '', chat_name: message.chat_name || '', platform: message.platform || '', is_group: message.is_group ? '1' : '0', highlightMessageId: message.id } }),
    })),
    ...openPromises.slice(0, Math.max(0, 4 - Math.min(urgent.length, 3))).map(promise => ({
      key: `promise-${promise.id}`,
      title: promise.content,
      subtitle: promise.chat?.name || (promise.from_me ? 'Your promise' : "You're waiting"),
      meta: promise.deadline ? `Due ${new Date(promise.deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : 'Open promise',
      kind: 'promise' as const,
      onPress: () => promise.chat_id ? router.push({ pathname: '/chat/[chatId]', params: { chatId: promise.chat_id, chat_name: promise.chat?.name || '', platform: promise.chat?.platform || '', is_group: promise.chat?.is_group ? '1' : '0' } }) : router.push('/(tabs)/promises'),
    })),
  ], [openPromises, urgent]);

  const refreshing = brief.isRefetching || promises.isRefetching || inbox.isRefetching;
  const refresh = () => void Promise.all([brief.refetch(), promises.refetch(), inbox.fetchMessages()]);

  return (
    <ScrollView
      testID="home-screen"
      style={{ flex: 1, backgroundColor: colors.cream }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingBottom: 112 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.ink} />}
    >
      <MobileHeader
        eyebrow={new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
        title={`${greeting()},\n${firstName}.`}
        subtitle={urgent.length + openPromises.length === 0 ? "You're clear right now." : "You're clear after a few quick actions."}
        profile={
          <Pressable accessibilityRole="button" accessibilityLabel="Open settings" onPress={() => router.push('/(tabs)/settings')}>
            <MobileAvatar name={user?.name || user?.email || 'You'} uri={user?.avatar_url} size={44} badge={<View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: colors.lime, borderWidth: 2, borderColor: colors.cream }} />} />
          </Pressable>
        }
      />

      <View style={{ paddingHorizontal: space[4], gap: space[4] }}>
        <Pressable
          testID="home-needs-reply"
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/(tabs)/messages', params: { filter: 'needs_reply' } })}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[4], borderRadius: 20, borderCurve: 'continuous', borderWidth: 1, borderColor: colors.ink, backgroundColor: colors.lime, opacity: pressed ? 0.78 : 1 })}
        >
          <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}><ArrowUpRight size={22} color={colors.paper} /></View>
          <View style={{ flex: 1 }}>
            <Text selectable style={{ ...mobileType.monoLabel, color: colors.ink }}>NEEDS A REPLY</Text>
            <Text selectable style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>{urgent.length} conversation{urgent.length === 1 ? '' : 's'} waiting</Text>
          </View>
          <Text style={{ ...mobileType.label, color: colors.ink }}>View</Text>
        </Pressable>

        <SectionLabel title="Your day" detail={`${dayItems.length} items`} />
        {brief.isLoading || promises.isLoading ? (
          <View style={{ paddingVertical: 56 }}><ActivityIndicator color={colors.ink} /></View>
        ) : dayItems.length === 0 ? (
          <MobileState title="A calm day" message="New messages and promises that need attention will appear here." />
        ) : (
          <View>
            {dayItems.map(item => (
              <Pressable key={item.key} onPress={item.onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 70, paddingVertical: space[3], borderBottomWidth: 1, borderBottomColor: colors.neutral[200], opacity: pressed ? 0.65 : 1 })}>
                <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: item.kind === 'promise' ? colors.blush : colors.sky, alignItems: 'center', justifyContent: 'center' }}>
                  {item.kind === 'promise' ? <CheckCircle2 size={19} color={colors.ink} /> : <MessageCircle size={19} color={colors.ink} />}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text selectable numberOfLines={1} style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>{item.title}</Text>
                  <Text selectable numberOfLines={1} style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{item.subtitle}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 3 }}><Clock3 size={14} color={colors.neutral[400]} /><Text style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>{item.meta}</Text></View>
              </Pressable>
            ))}
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: space[3], padding: space[4], backgroundColor: colors.sky, borderRadius: radius.card, borderCurve: 'continuous' }}>
          <Sparkles size={21} color={colors.ink} />
          <View style={{ flex: 1, gap: 3 }}>
            <Text selectable style={{ ...mobileType.monoLabel, color: colors.ink }}>CLAIRE'S TAKE</Text>
            <Text selectable style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>{brief.data?.brief_text || 'Your priorities will settle here as conversations sync.'}</Text>
          </View>
          <MobileIconButton label="Open settings" onPress={() => router.push('/(tabs)/settings')}><Settings size={18} color={colors.ink} /></MobileIconButton>
        </View>
      </View>
    </ScrollView>
  );
}
