import { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import { Plus, X } from 'lucide-react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { colors, mobileType, radius, space } from '@claire/design-system';
import { MobileChip, MobileHeader, MobileIconButton, MobileState } from '../../components/mobile/claire-mobile';
import type { LoopItem } from '../../services/loop-types';
import { hydrateMobileCache, usesNativeMobileCache } from '../../services/mobile-cache';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../services/supabase';
import { LoopsSkeleton } from '../../components/claire/skeleton';
import { LoopRow } from './loop-row';

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
  const loopsQueryKey = useMemo(() => ['mobile-loops', user?.id] as const, [user?.id]);
  const query = useQuery({ queryKey: loopsQueryKey, enabled: !!user?.id, queryFn: () => fetchLoops(user!.id), staleTime: 60_000 });

  // The bootstrap sync already writes loops to the local cache and hydrates
  // them into a snapshot nobody read. Seed from it so returning to this tab
  // paints immediately instead of waiting on Supabase, and let the query
  // refresh behind the rendered list. Stale on purpose: a starting picture, not
  // a fetch, so refetchOnMount still runs.
  useEffect(() => {
    if (!user?.id || !usesNativeMobileCache()) return;
    let active = true;
    void hydrateMobileCache(user.id)
      .then((snapshot) => {
        if (!active || !snapshot.loops.length) return;
        if (queryClient.getQueryData(loopsQueryKey)) return;
        queryClient.setQueryData(loopsQueryKey, snapshot.loops as unknown as LoopItem[], { updatedAt: 0 });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [queryClient, loopsQueryKey, user?.id]);
  const patch = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: LoopItem['status'] }) => {
      const { data, error } = await supabase
        .from('loops')
        .update({ status })
        .eq('id', id)
        .eq('user_id', user!.id)
        .select(LOOP_SELECT)
        .single();
      if (error) throw error;
      return data as LoopItem;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mobile-loops', user?.id] }),
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

  const items = query.data ?? [];
  const open = items.filter(item => LIVE_STATUSES.includes(item.status));
  const completed = items.filter(item => item.status === 'done');
  // "I'm waiting" means someone else owes the next move — not merely that the
  // loop was detected from an inbound message.
  const waiting = open.filter(item => (item.owner ? item.owner === 'them' : !item.from_me));
  const today = open.filter(item => item.deadline && new Date(item.deadline).toDateString() === new Date().toDateString()).length;
  const forYou = open.filter(item => item.owner === 'me' || (!item.owner && item.from_me));
  const visible = filter === 'done' ? completed : filter === 'waiting' ? waiting : filter === 'for_you' ? forYou : open;
  const needsAttention = open.filter(item => (item.priority_score ?? 0) >= 80).length;

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
      {query.isLoading ? <LoopsSkeleton /> : (
        <FlatList testID="loops-list" data={visible} renderItem={({ item }) => <LoopRow item={item} onOpen={() => router.push({ pathname: '/loops/[id]', params: { id: item.id } })} onToggle={() => patch.mutate({ id: item.id, status: item.status === 'done' ? 'open' : 'done' })} />} keyExtractor={item => item.id} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: 112 }} refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={colors.ink} />} ListEmptyComponent={<MobileState title={filter === 'done' ? 'Nothing completed yet' : filter === 'waiting' ? "You're not waiting on anyone" : 'No open loops'} message="Claire will surface commitments from your conversations here." />} />
      )}

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
