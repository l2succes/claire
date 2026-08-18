import { useMemo, type ReactNode } from 'react';
import { Pressable, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Text, View, useMedia } from '@tamagui/core';
import { ArrowUpRight, CheckCircle2, MessageCircle, Sparkles } from 'lucide-react-native';
import { colors, type } from '@claire/design-system';
import { useAuthStore } from '../../stores/authStore';
import { useInboxMessages } from '../../hooks/useInboxMessages';
import { supabase } from '../../services/supabase';
import { formatInboxTimestamp } from '../../utils/messageTimestamp';
import { installationId, listHandoffs, type WorkspaceHandoff } from '../../services/handoffs';

type OpenPromise = { id: string; content: string; chat_id?: string | null; deadline?: string | null };

type PrimaryHomeAction = {
  eyebrow: string;
  title: string;
  rowTitle: string;
  rowDetail: string;
  action: string;
  icon: ReactNode;
  onPress: () => void;
};

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

function actionFromHandoff(handoff: WorkspaceHandoff): PrimaryHomeAction {
  const destination = handoff.payload.route || (handoff.payload.chatId ? `/chat/${handoff.payload.chatId}` : '/messages');
  const source = handoff.source_platform === 'electron' ? 'ANOTHER DESKTOP' : handoff.source_platform.toUpperCase();
  return {
    eyebrow: `CONTINUE FROM ${source}`,
    title: 'Pick up where you left off.',
    rowTitle: handoff.payload.draft ? 'Your draft is ready to continue' : 'Restore your recent workspace',
    rowDetail: handoff.payload.draft || 'Your conversation, search, or Claire context is ready here.',
    action: 'Continue',
    icon: <MessageCircle size={18} color={colors.ink} />,
    onPress: () => router.push(destination as never),
  };
}

/** Desktop is its own composition, not a stretched phone feed. */
export function DesktopHomeScreen() {
  const user = useAuthStore((state) => state.user);
  const inbox = useInboxMessages(user?.id, { filter: 'needs_reply' });
  const media = useMedia();
  const promises = useQuery({
    queryKey: ['desktop-home-promises', user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('promises').select('id, content, chat_id, deadline').eq('user_id', user!.id).in('status', ['pending', 'overdue']).order('updated_at', { ascending: false }).limit(8);
      if (error) throw error;
      return (data || []) as OpenPromise[];
    },
  });
  const handoff = useQuery({
    queryKey: ['desktop-home-handoff', user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return null;
      const ownInstallation = await installationId();
      return (await listHandoffs(session.access_token)).find(
        (candidate) => candidate.installation_id !== ownInstallation,
      ) || null;
    },
  });
  const firstName = user?.name?.trim().split(/\s+/)[0] || user?.email?.split('@')[0] || 'there';
  const needsReply = inbox.messages.filter((item) => !item.from_me).slice(0, 5);
  const latest = useMemo(() => needsReply[0], [needsReply]);
  const primaryAction = useMemo<PrimaryHomeAction>(() => {
    if (handoff.data) return actionFromHandoff(handoff.data);

    if (needsReply.length) {
      return {
        eyebrow: 'NEEDS A REPLY',
        title: `${needsReply.length} conversation${needsReply.length === 1 ? '' : 's'} ${needsReply.length === 1 ? 'is' : 'are'} waiting.`,
        rowTitle: `Reply to ${latest?.chat_name || latest?.contact_name || 'your next conversation'}`,
        rowDetail: latest?.content || 'A message is waiting for you.',
        action: 'Reply',
        icon: <MessageCircle size={18} color={colors.ink} />,
        onPress: () => latest
          ? router.push({ pathname: '/chat/[chatId]', params: { chatId: latest.chat_id, platform: latest.platform || '', chat_name: latest.chat_name || '', contact_name: latest.contact_name || '', is_group: latest.is_group ? '1' : '0' } } as never)
          : router.push('/messages'),
      };
    }

    const firstPromise = promises.data?.[0];
    if (firstPromise) {
      return {
        eyebrow: 'OPEN PROMISES',
        title: `${promises.data?.length || 1} open promise${(promises.data?.length || 1) === 1 ? '' : 's'} to keep moving.`,
        rowTitle: firstPromise.content,
        rowDetail: firstPromise.deadline ? `Due ${new Date(firstPromise.deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : 'Open loop',
        action: 'Open',
        icon: <CheckCircle2 size={18} color={colors.ink} />,
        onPress: () => firstPromise.chat_id
          ? router.push(`/chat/${firstPromise.chat_id}` as never)
          : router.push('/promises'),
      };
    }

    return {
      eyebrow: 'ALL CLEAR',
      title: 'Your inbox is clear.',
      rowTitle: 'Ask Claire for a quick catch-up',
      rowDetail: 'Review recent conversations, people, and open context.',
      action: 'Ask Claire',
      icon: <Sparkles size={18} color={colors.ink} />,
      onPress: () => router.push('/ask-claire'),
    };
  }, [handoff.data, latest, needsReply.length, promises.data]);
  const greetingSummary = needsReply.length
    ? `${needsReply.length} conversation${needsReply.length === 1 ? '' : 's'} ${needsReply.length === 1 ? 'is' : 'are'} waiting.`
    : promises.data?.length
      ? `${promises.data.length} open promise${promises.data.length === 1 ? '' : 's'} to keep moving.`
      : 'You’re clear right now.';

  return <ScrollView style={{ flex: 1, backgroundColor: colors.cream }} contentContainerStyle={{ padding: 34, paddingBottom: 64 }} testID="desktop-home-screen">
    <View width="100%" maxWidth={1180} alignSelf="center" rowGap="$5">
      <View flexDirection="row" alignItems="flex-start" justifyContent="space-between" columnGap="$5">
        <View rowGap="$1"><Text style={{ ...type.monoLabel, color: colors.neutral[600] }}>{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase()}</Text><Text style={type.screenTitle}>{greeting()}, {firstName}.</Text><Text style={{ ...type.body, color: colors.neutral[600] }}>{greetingSummary}</Text></View>
        <Pressable onPress={() => router.push('/messages')} accessibilityRole="button"><View height={38} paddingHorizontal="$3" borderRadius={99} backgroundColor="$ink" alignItems="center" justifyContent="center"><Text style={{ ...type.label, color: colors.paper }}>Open Inbox ↗</Text></View></Pressable>
      </View>

      <View flexDirection={media.gtWide ? 'row' : 'column'} columnGap="$3" rowGap="$3" alignItems="stretch">
        <View flex={1.15} minHeight={270} borderRadius={20} borderWidth={1} borderColor="$ink" backgroundColor="$lime" padding="$4" rowGap="$3">
          <Text style={{ ...type.monoLabel, color: colors.ink }}>{primaryAction.eyebrow}</Text>
          <Text style={{ ...type.screenTitle, fontSize: 32, lineHeight: 34 }}>{primaryAction.title}</Text>
          <View marginTop="auto" rowGap="$1">
            <DesktopActionRow icon={primaryAction.icon} title={primaryAction.rowTitle} detail={primaryAction.rowDetail} action={primaryAction.action} onPress={primaryAction.onPress} dark />
          </View>
        </View>
        <View flex={0.85} minHeight={270} borderRadius={20} borderWidth={1} borderColor="$neutral200" backgroundColor="$paper" padding="$4" rowGap="$2">
          <Text style={{ ...type.monoLabel, color: colors.ink }}>CONNECTION HEALTH</Text>
          <HealthRow name="WhatsApp" detail="Cloud bridge" state="HEALTHY" />
          <HealthRow name="iMessage" detail="On this Mac" state="LOCAL" />
          <HealthRow name="Instagram" detail="Desktop sign-in" state="ACTION" warning />
          <Pressable onPress={() => router.push('/connections')}><Text style={{ ...type.label, color: colors.ink, marginTop: 'auto' }}>Manage connections →</Text></Pressable>
        </View>
      </View>

      <View flexDirection={media.gtWide ? 'row' : 'column'} columnGap="$3" rowGap="$3">
        <View flex={1} minHeight={185} borderRadius={20} borderWidth={1} borderColor="$neutral200" backgroundColor="$paper" padding="$4" rowGap="$2"><Text style={{ ...type.monoLabel, color: colors.ink }}>NEEDS A REPLY</Text>{needsReply.slice(0, 2).map((message) => <DesktopActionRow key={message.id} icon={<ArrowUpRight size={17} color={colors.ink} />} title={message.chat_name || message.contact_name || 'Conversation'} detail={message.content || 'New message'} action="Reply" onPress={() => router.push({ pathname: '/chat/[chatId]', params: { chatId: message.chat_id, platform: message.platform || '', chat_name: message.chat_name || '', contact_name: message.contact_name || '', is_group: message.is_group ? '1' : '0' } } as never)} />)}{!needsReply.length ? <Text style={{ ...type.bodySmall, color: colors.neutral[600] }}>Nothing waiting for you.</Text> : null}</View>
        <View flex={1} minHeight={185} borderRadius={20} borderWidth={1} borderColor="$neutral200" backgroundColor="$paper" padding="$4" rowGap="$2"><Text style={{ ...type.monoLabel, color: colors.ink }}>OPEN PROMISES</Text>{(promises.data || []).slice(0, 2).map((promise) => <DesktopActionRow key={promise.id} icon={<CheckCircle2 size={17} color={colors.ink} />} title={promise.content} detail={promise.deadline ? `Due ${new Date(promise.deadline).toLocaleDateString()}` : 'Open loop'} action="Open" onPress={() => promise.chat_id ? router.push(`/chat/${promise.chat_id}` as never) : router.push('/promises')} />)}{!promises.data?.length ? <Text style={{ ...type.bodySmall, color: colors.neutral[600] }}>No open loops right now.</Text> : null}</View>
      </View>
    </View>
  </ScrollView>;
}

function DesktopActionRow({ icon, title, detail, action, onPress, dark = false }: { icon: ReactNode; title: string; detail: string; action: string; onPress: () => void; dark?: boolean }) {
  return <View flexDirection="row" alignItems="center" columnGap="$2" paddingVertical="$2" borderTopWidth={1} borderColor={dark ? '$neutral800' : '$neutral200'}><View width={30} height={30} borderRadius={9} backgroundColor={dark ? '$paper' : '$sky'} alignItems="center" justifyContent="center">{icon}</View><View flex={1} minWidth={0}><Text numberOfLines={1} style={{ ...type.bodySmall, fontWeight: '700', color: colors.ink }}>{title}</Text><Text numberOfLines={1} style={{ ...type.label, color: colors.neutral[600] }}>{detail}</Text></View><Pressable onPress={onPress}><View paddingHorizontal="$2" paddingVertical={5} borderRadius={99} borderWidth={1} borderColor="$ink"><Text style={{ ...type.label, color: colors.ink }}>{action}</Text></View></Pressable></View>;
}

function HealthRow({ name, detail, state, warning = false }: { name: string; detail: string; state: string; warning?: boolean }) {
  return <View flexDirection="row" alignItems="center" columnGap="$2" paddingVertical={5}><View width={27} height={27} borderRadius={8} backgroundColor="$neutral100" alignItems="center" justifyContent="center"><Text style={{ ...type.label, color: colors.ink }}>{name[0]}</Text></View><View flex={1}><Text style={{ ...type.bodySmall, fontWeight: '700' }}>{name}</Text><Text style={{ ...type.label, color: colors.neutral[600] }}>{detail}</Text></View><Text style={{ ...type.monoLabel, color: warning ? colors.warning : colors.success }}>{state}</Text></View>;
}

function DesktopMessageRow({ name, preview, time, onPress }: { name: string; preview: string; time: string; onPress: () => void }) {
  return <Pressable onPress={onPress} accessibilityRole="button"><View minHeight={78} paddingHorizontal="$4" paddingVertical="$3" flexDirection="row" alignItems="center" columnGap="$3" borderTopWidth={1} borderColor="$neutral200"><View width={38} height={38} borderRadius={13} backgroundColor="$blush" alignItems="center" justifyContent="center"><MessageCircle size={19} color={colors.ink} /></View><View flex={1} rowGap={2} alignItems="flex-start"><Text textAlign="left" numberOfLines={1} style={{ ...type.body, fontWeight: '700' }}>{name}</Text><Text textAlign="left" numberOfLines={1} style={{ ...type.bodySmall, color: colors.neutral[600] }}>{preview}</Text></View><Text textAlign="right" style={{ ...type.monoLabel, color: colors.neutral[600] }}>{time}</Text></View></Pressable>;
}
