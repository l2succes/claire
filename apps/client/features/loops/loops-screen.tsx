import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import { Plus, X } from 'lucide-react-native';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { colors, mobileType, radius, space } from '@claire/design-system';
import { MobileChip, MobileHeader, MobileIconButton, MobileState } from '../../components/mobile/claire-mobile';
import type { LoopItem } from '../../services/loop-types';
import { cachedLoops, replaceCachedLoops } from '../../services/mobile-cache';
import { useLocalFirstQuery } from '../../hooks/useLocalFirstQuery';
import { useScreenLoadMark } from '../../hooks/useScreenLoadMark';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../services/supabase';
import { LoopsSkeleton } from '../../components/claire/skeleton';
import { LoopRow } from './loop-row';
import { snoozeLoop, updateLoop } from '../../services/loops';
import { BottomSheet } from '../../components/mobile/bottom-sheet';
import { isLoopDeferred } from '../../services/loop-display';

type LoopFilter = 'for_you' | 'done' | 'waiting' | 'all';

const LOOP_SELECT = `
  *,
  contact:contacts!loops_contact_id_fkey(name, inferred_name, avatar_url),
  chat:chats!loops_chat_id_fkey(
    name, is_group, platform,
    contact:contacts!chats_contact_id_fkey(name, inferred_name, avatar_url)
  )
`;

async function fetchLoops(userId: string): Promise<LoopItem[]> {
  const { data, error } = await supabase
    .from('loops')
    .select(LOOP_SELECT)
    .eq('user_id', userId)
    .order('priority_score', { ascending: false, nullsFirst: false })
    .order('last_evidence_at', { ascending: false, nullsFirst: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as LoopItem[];
}

const LIVE_STATUSES: LoopItem['status'][] = ['open', 'waiting', 'snoozed'];

// Overdue is derived, never stored: a loop is overdue when the date it next
// needs attention has passed. Snoozing moves that date without touching the
// deadline the user actually committed to.
export function LoopsScreen() {
  const user = useAuthStore(state => state.user);
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<LoopFilter>('for_you');
  const [showCreate, setShowCreate] = useState(false);
  const [newLoop, setNewLoop] = useState('');
  const [snoozeTarget, setSnoozeTarget] = useState<LoopItem | null>(null);
  const loopsQueryKey = useMemo(() => ['mobile-loops', user?.id] as const, [user?.id]);
  // The sync stream already keeps cache_loops current; reading it costs one
  // indexed table rather than the whole snapshot, which also parses every chat.
  const query = useLocalFirstQuery<LoopItem[]>({
    queryKey: loopsQueryKey,
    enabled: !!user?.id,
    queryFn: () => fetchLoops(user!.id),
    staleTime: 60_000,
    local: {
      enabled: !!user?.id,
      read: async () => (user?.id ? (await cachedLoops(user.id)) as unknown as LoopItem[] : null),
      write: async (items) => {
        if (user?.id) await replaceCachedLoops(user.id, items as unknown as Array<Record<string, unknown>>);
      },
    },
  });
  const patch = useMutation({
    mutationFn: ({ id, ...next }: { id: string; status: LoopItem['status']; owner?: LoopItem['owner'] }) =>
      updateLoop(id, next),
    onMutate: async ({ id, ...next }) => {
      await queryClient.cancelQueries({ queryKey: loopsQueryKey });
      const previous = queryClient.getQueryData<LoopItem[]>(loopsQueryKey);
      queryClient.setQueryData<LoopItem[]>(loopsQueryKey, (items) =>
        items?.map((item) => item.id === id ? { ...item, ...next } : item));
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(loopsQueryKey, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: loopsQueryKey }),
  });
  const snooze = useMutation({
    mutationFn: ({ id, until }: { id: string; until: string }) => snoozeLoop(id, until),
    onMutate: async ({ id, until }) => {
      await queryClient.cancelQueries({ queryKey: loopsQueryKey });
      const previous = queryClient.getQueryData<LoopItem[]>(loopsQueryKey);
      queryClient.setQueryData<LoopItem[]>(loopsQueryKey, (items) =>
        items?.map((item) => item.id === id ? { ...item, status: 'snoozed', snoozed_until: until } : item));
      setSnoozeTarget(null);
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(loopsQueryKey, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: loopsQueryKey }),
  });
  const create = useMutation({
    mutationFn: async (content: string) => {
      const { data, error } = await supabase
        .from('loops')
        .insert({
          user_id: user!.id,
          content,
          priority: 'medium',
          type: 'task',
          from_me: true,
          status: 'open',
          confidence: 1,
        })
        .select(LOOP_SELECT)
        .single();
      if (error) throw error;
      return data as LoopItem;
    },
    onSuccess: () => { setNewLoop(''); setShowCreate(false); queryClient.invalidateQueries({ queryKey: ['mobile-loops', user?.id] }); },
  });

  // One pass, memoised. These were six chained filters recomputed on every
  // render -- including every chip tap and every optimistic status toggle --
  // over as many as two hundred loops.
  const { open, completed, waiting, today, forYou, needsAttention } = useMemo(() => {
    const items = query.data ?? [];
    const todayKey = new Date().toDateString();
    const openItems: LoopItem[] = [];
    const completedItems: LoopItem[] = [];
    const waitingItems: LoopItem[] = [];
    const forYouItems: LoopItem[] = [];
    let dueToday = 0;
    let attention = 0;
    for (const item of items) {
      if (item.status === 'done') completedItems.push(item);
      if (!LIVE_STATUSES.includes(item.status)) continue;
      // A postponed loop returns when its reminder is due; keeping it in the
      // active list immediately after a swipe makes “Later” appear to do
      // nothing and defeats the purpose of postponing it.
      if (isLoopDeferred(item)) continue;
      openItems.push(item);
      // "I'm waiting" means someone else owes the next move — not merely that
      // the loop was detected from an inbound message.
      if (item.owner ? item.owner === 'them' : !item.from_me) waitingItems.push(item);
      if (item.owner === 'me' || (!item.owner && item.from_me)) forYouItems.push(item);
      if (item.deadline && new Date(item.deadline).toDateString() === todayKey) dueToday += 1;
      if ((item.priority_score ?? 0) >= 80) attention += 1;
    }
    return { open: openItems, completed: completedItems, waiting: waitingItems, today: dueToday, forYou: forYouItems, needsAttention: attention };
  }, [query.data]);
  const visible = filter === 'done' ? completed : filter === 'waiting' ? waiting : filter === 'for_you' ? forYou : open;
  useScreenLoadMark('loops', { hasData: !query.isCold, isFetching: query.isFetching, source: query.isFetching ? 'cache' : 'network' });

  return (
    <View testID="loops-screen" style={{ flex: 1, backgroundColor: colors.cream }}>
      <MobileHeader title="Loops" subtitle="Follow through without losing the conversation." safeArea actions={<MobileIconButton label="Add a loop" testID="loops-add" onPress={() => setShowCreate(true)}><Plus size={21} color={colors.ink} /></MobileIconButton>} />
      <View style={{ paddingHorizontal: space[4], gap: space[3], paddingBottom: space[3] }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          <View style={{ flex: 1, padding: space[4], borderRadius: radius.card, backgroundColor: colors.lime }}><Text style={{ ...mobileType.screenTitle, color: colors.ink, fontVariant: ['tabular-nums'] }}>{needsAttention}</Text><Text style={{ ...mobileType.monoLabel, color: colors.ink }}>NEED ATTENTION</Text></View>
          <View style={{ flex: 1, padding: space[4], borderRadius: radius.card, backgroundColor: colors.sky }}><Text style={{ ...mobileType.screenTitle, color: colors.ink, fontVariant: ['tabular-nums'] }}>{today}</Text><Text style={{ ...mobileType.monoLabel, color: colors.ink }}>DUE TODAY</Text></View>
        </View>
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          <MobileChip label="For you" active={filter === 'for_you'} count={forYou.length} onPress={() => setFilter('for_you')} testID="loops-tab-open" />
          <MobileChip label="Completed" active={filter === 'done'} onPress={() => setFilter('done')} testID="loops-tab-done" />
          <MobileChip label="I'm waiting" active={filter === 'waiting'} count={waiting.length} onPress={() => setFilter('waiting')} testID="loops-tab-waiting" />
          <MobileChip label="All" active={filter === 'all'} count={open.length} onPress={() => setFilter('all')} testID="loops-tab-all" />
        </View>
      </View>
      {query.isCold ? <LoopsSkeleton /> : (
        <FlatList testID="loops-list" data={visible} renderItem={({ item }) => <LoopRow item={item} onOpen={() => router.push({ pathname: '/loops/[id]', params: { id: item.id } })} onToggle={() => patch.mutate({ id: item.id, status: item.status === 'done' ? 'open' : 'done' })} onWait={item.status === 'done' ? undefined : () => patch.mutate({ id: item.id, owner: item.owner === 'them' ? 'me' : 'them', status: item.owner === 'them' ? 'open' : 'waiting' })} onSnooze={item.status === 'done' ? undefined : () => setSnoozeTarget(item)} />} keyExtractor={item => item.id} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: 112 }} refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={colors.ink} />} ListEmptyComponent={<MobileState title={filter === 'done' ? 'Nothing completed yet' : filter === 'waiting' ? "You're not waiting on anyone" : 'No open loops'} message="Claire will surface commitments from your conversations here." />} />
      )}

      <BottomSheet
        visible={!!snoozeTarget}
        title="Postpone loop"
        onClose={() => setSnoozeTarget(null)}
        testID="loop-snooze-sheet"
        snapPoints={['46%']}
      >
        <View style={{ paddingHorizontal: space[4], gap: space[2] }}>
          {[
            { id: 'later-today', label: 'Later today', until: () => new Date(Date.now() + 3 * 60 * 60 * 1000) },
            { id: 'tomorrow', label: 'Tomorrow morning', until: () => { const date = new Date(); date.setDate(date.getDate() + 1); date.setHours(9, 0, 0, 0); return date; } },
            { id: 'next-week', label: 'Next week', until: () => { const date = new Date(); date.setDate(date.getDate() + 7); date.setHours(9, 0, 0, 0); return date; } },
          ].map((option) => (
            <Pressable
              key={option.id}
              testID={`loop-snooze-${option.id}`}
              accessibilityRole="button"
              onPress={() => {
                if (snoozeTarget) snooze.mutate({ id: snoozeTarget.id, until: option.until().toISOString() });
              }}
              style={{ minHeight: 50, paddingHorizontal: space[4], justifyContent: 'center', borderRadius: radius.control, backgroundColor: colors.cream }}
            >
              <Text selectable style={{ ...mobileType.body, color: colors.ink }}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
      </BottomSheet>

      <Modal visible={showCreate} transparent animationType="slide" onRequestClose={() => setShowCreate(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(16,18,15,0.35)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.paper, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: space[5], paddingBottom: 36, gap: space[4] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={{ ...mobileType.sectionTitle, flex: 1, color: colors.ink }}>Add a loop</Text><MobileIconButton label="Close" onPress={() => setShowCreate(false)}><X size={19} color={colors.ink} /></MobileIconButton></View>
            <TextInput autoFocus multiline value={newLoop} onChangeText={setNewLoop} placeholder="What do you want to remember?" placeholderTextColor={colors.neutral[400]} style={{ minHeight: 110, textAlignVertical: 'top', padding: space[4], borderRadius: radius.card, borderWidth: 1, borderColor: colors.neutral[200], backgroundColor: colors.cream, ...mobileType.body, color: colors.ink }} />
            {create.error ? <Text selectable style={{ ...mobileType.bodySmall, color: colors.danger }}>{create.error.message}</Text> : null}
            <Pressable disabled={!newLoop.trim() || create.isPending} onPress={() => create.mutate(newLoop.trim())} style={({ pressed }) => ({ minHeight: 50, borderRadius: radius.control, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', opacity: !newLoop.trim() || create.isPending ? 0.42 : pressed ? 0.78 : 1 })}><Text style={{ ...mobileType.body, fontWeight: '700', color: colors.paper }}>{create.isPending ? 'Adding…' : 'Add loop'}</Text></Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
