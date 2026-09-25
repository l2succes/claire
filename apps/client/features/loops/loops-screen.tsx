import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { Check, RotateCcw, XCircle } from 'lucide-react-native';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Animated, { FadeInRight, FadeOutLeft } from 'react-native-reanimated';
import { colors, mobileType, radius, space } from '@claire/design-system';
import { MobileChip, MobileHeader, MobileState } from '../../components/mobile/claire-mobile';
import type { LoopItem } from '../../services/loop-types';
import { cacheLoop, cachedLoops, replaceCachedLoops } from '../../services/mobile-cache';
import { useLocalFirstQuery } from '../../hooks/useLocalFirstQuery';
import { useScreenLoadMark } from '../../hooks/useScreenLoadMark';
import { useAuthStore } from '../../stores/authStore';
import { fetchLoopList } from '../../services/loop-list';
import { LoopsSkeleton } from '../../components/claire/skeleton';
import { LoopRow } from './loop-row';
import { reviewLoop, snoozeLoop, updateLoop } from '../../services/loops';
import { BottomSheet } from '../../components/mobile/bottom-sheet';
import { isLoopDeferred, isLoopClosed } from '../../services/loop-display';
import { useLoopAttention } from '../../hooks/useLoopAttention';
import { userFacingErrorMessage } from '../../services/api-errors';
import {
  invalidateLoopQueries,
  patchLoopQueries,
  restoreLoopQueries,
  snapshotLoopQueries,
} from '../../services/loop-query-cache';

type LoopFilter = 'for_you' | 'done' | 'waiting' | 'all';

const LIVE_STATUSES: LoopItem['status'][] = ['open', 'waiting', 'snoozed'];

function ReviewButton({
  label,
  icon: Icon,
  onPress,
  tone = 'neutral',
  testID,
  disabled,
}: {
  label: string;
  icon: typeof Check;
  onPress: () => void;
  tone?: 'neutral' | 'primary' | 'danger';
  testID: string;
  disabled?: boolean;
}) {
  const [pressed, setPressed] = useState(false);
  const background = tone === 'primary' ? colors.ink : tone === 'danger' ? colors.blush : colors.cream;
  const foreground = tone === 'primary' ? colors.paper : tone === 'danger' ? colors.danger : colors.ink;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={{
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space[2],
        paddingHorizontal: space[3],
        borderRadius: radius.control,
        borderWidth: tone === 'neutral' ? 1 : 0,
        borderColor: colors.neutral[200],
        backgroundColor: background,
        opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
      }}
    >
      <Icon size={17} color={foreground} />
      <Text style={{ ...mobileType.bodySmall, fontWeight: '700', color: foreground }}>{label}</Text>
    </Pressable>
  );
}

// Overdue is derived, never stored: a loop is overdue when the date it next
// needs attention has passed. Snoozing moves that date without touching the
// deadline the user actually committed to.
export function LoopsScreen() {
  const user = useAuthStore(state => state.user);
  const queryClient = useQueryClient();
  const attentionQuery = useLoopAttention();
  const [filter, setFilter] = useState<LoopFilter>('for_you');
  const [snoozeTarget, setSnoozeTarget] = useState<LoopItem | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const loopsQueryKey = useMemo(() => ['mobile-loops', user?.id] as const, [user?.id]);
  // The sync stream already keeps cache_loops current; reading it costs one
  // indexed table rather than the whole snapshot, which also parses every chat.
  const query = useLocalFirstQuery<LoopItem[]>({
    queryKey: loopsQueryKey,
    enabled: !!user?.id,
    queryFn: () => fetchLoopList(user!.id),
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
      await Promise.all([
        queryClient.cancelQueries({ queryKey: loopsQueryKey }),
        queryClient.cancelQueries({ queryKey: ['mobile-home-loops', user?.id] }),
        queryClient.cancelQueries({ queryKey: ['loop-attention', user?.id] }),
      ]);
      const snapshot = snapshotLoopQueries(queryClient, user?.id, id);
      patchLoopQueries(queryClient, user?.id, id, next);
      return { snapshot };
    },
    onError: (_error, _variables, context) => {
      if (context?.snapshot) restoreLoopQueries(queryClient, user?.id, _variables.id, context.snapshot);
      Alert.alert('Could not update loop', userFacingErrorMessage(_error));
    },
    onSuccess: async (updated) => {
      patchLoopQueries(queryClient, user?.id, updated.id, updated);
      if (user?.id) await cacheLoop(user.id, updated as unknown as Record<string, unknown>);
    },
    onSettled: (_data, _error, variables) => invalidateLoopQueries(queryClient, user?.id, variables.id),
  });
  const snooze = useMutation({
    mutationFn: ({ id, until }: { id: string; until: string }) => snoozeLoop(id, until),
    onMutate: async ({ id, until }) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: loopsQueryKey }),
        queryClient.cancelQueries({ queryKey: ['mobile-home-loops', user?.id] }),
        queryClient.cancelQueries({ queryKey: ['loop-attention', user?.id] }),
      ]);
      const snapshot = snapshotLoopQueries(queryClient, user?.id, id);
      patchLoopQueries(queryClient, user?.id, id, { status: 'snoozed', snoozed_until: until });
      setSnoozeTarget(null);
      return { snapshot };
    },
    onError: (_error, variables, context) => {
      if (context?.snapshot) restoreLoopQueries(queryClient, user?.id, variables.id, context.snapshot);
      Alert.alert('Could not postpone loop', userFacingErrorMessage(_error));
    },
    onSuccess: async (updated) => {
      patchLoopQueries(queryClient, user?.id, updated.id, updated);
      if (user?.id) await cacheLoop(user.id, updated as unknown as Record<string, unknown>);
    },
    onSettled: (_data, _error, variables) => invalidateLoopQueries(queryClient, user?.id, variables.id),
  });
  const review = useMutation({
    mutationFn: ({ id, ...input }: { id: string } & Parameters<typeof reviewLoop>[1]) => reviewLoop(id, input),
    onMutate: async ({ id, action }) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: loopsQueryKey }),
        queryClient.cancelQueries({ queryKey: ['mobile-home-loops', user?.id] }),
        queryClient.cancelQueries({ queryKey: ['loop-attention', user?.id] }),
      ]);
      const snapshot = snapshotLoopQueries(queryClient, user?.id, id);
      const reviewedAt = new Date().toISOString();
      patchLoopQueries(queryClient, user?.id, id, action === 'done'
        ? { status: 'done', thread_state: 'resolved', reviewed_at: reviewedAt }
        : action === 'dismiss'
          ? { status: 'dropped', thread_state: 'resolved', reviewed_at: reviewedAt }
          : { reviewed_at: reviewedAt });
      return { snapshot };
    },
    onError: (_error, variables, context) => {
      if (context?.snapshot) restoreLoopQueries(queryClient, user?.id, variables.id, context.snapshot);
    },
    onSuccess: async (updated) => {
      patchLoopQueries(queryClient, user?.id, updated.id, updated);
      if (user?.id) await cacheLoop(user.id, updated as unknown as Record<string, unknown>);
    },
    onSettled: (_data, _error, variables) => invalidateLoopQueries(queryClient, user?.id, variables.id),
  });

  // One pass, memoised. These were six chained filters recomputed on every
  // render -- including every chip tap and every optimistic status toggle --
  // over the complete loop collection.
  const { open, completed, waiting, today, forYou } = useMemo(() => {
    const items = query.data ?? [];
    const todayKey = new Date().toDateString();
    const openItems: LoopItem[] = [];
    const completedItems: LoopItem[] = [];
    const waitingItems: LoopItem[] = [];
    const forYouItems: LoopItem[] = [];
    let dueToday = 0;
    for (const item of items) {
      if (['done', 'dropped', 'superseded'].includes(item.status)) completedItems.push(item);
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
    }
    return { open: openItems, completed: completedItems, waiting: waitingItems, today: dueToday, forYou: forYouItems };
  }, [query.data]);
  const visible = filter === 'done' ? completed : filter === 'waiting' ? waiting : filter === 'for_you' ? forYou : open;
  const reviewCandidates = useMemo(
    () => (attentionQuery.data ?? []).map(item => item.loop),
    [attentionQuery.data],
  );
  const reviewTarget = reviewCandidates[0] ?? null;

  useEffect(() => {
    if (reviewOpen && !reviewTarget && !review.isPending && !review.error) setReviewOpen(false);
  }, [reviewOpen, reviewTarget, review.isPending, review.error]);

  useScreenLoadMark('loops', { hasData: !query.isCold, isFetching: query.isFetching, source: query.isFetching ? 'cache' : 'network' });

  return (
    <View testID="loops-screen" style={{ flex: 1, backgroundColor: colors.cream }}>
      <MobileHeader title="Loops" subtitle="Follow through without losing the conversation." safeArea />
      <View style={{ paddingHorizontal: space[4], gap: space[3], paddingBottom: space[3] }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          <View style={{ flex: 1, padding: space[4], borderRadius: radius.card, backgroundColor: colors.lime }}><Text style={{ ...mobileType.screenTitle, color: colors.ink, fontVariant: ['tabular-nums'] }}>{attentionQuery.data?.length ?? '—'}</Text><Text style={{ ...mobileType.monoLabel, color: colors.ink }}>NEED ATTENTION</Text></View>
          <View style={{ flex: 1, padding: space[4], borderRadius: radius.card, backgroundColor: colors.sky }}><Text style={{ ...mobileType.screenTitle, color: colors.ink, fontVariant: ['tabular-nums'] }}>{today}</Text><Text style={{ ...mobileType.monoLabel, color: colors.ink }}>DUE TODAY</Text></View>
        </View>
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          <MobileChip label="For you" active={filter === 'for_you'} count={forYou.length} onPress={() => setFilter('for_you')} testID="loops-tab-open" />
          <MobileChip label="Closed" active={filter === 'done'} onPress={() => setFilter('done')} testID="loops-tab-done" />
          <MobileChip label="I'm waiting" active={filter === 'waiting'} count={waiting.length} onPress={() => setFilter('waiting')} testID="loops-tab-waiting" />
          <MobileChip label="All" active={filter === 'all'} count={open.length} onPress={() => setFilter('all')} testID="loops-tab-all" />
        </View>
        {reviewCandidates.length ? (
          <Pressable
            testID="loops-review-old"
            accessibilityRole="button"
            accessibilityLabel={`Review ${reviewCandidates.length} ${reviewCandidates.length === 1 ? 'loop' : 'loops'}`}
            onPress={() => setReviewOpen(true)}
            style={{
              minHeight: 52,
              paddingHorizontal: space[3],
              flexDirection: 'row',
              alignItems: 'center',
              gap: space[2],
              borderRadius: radius.control,
              borderWidth: 1,
              borderColor: colors.ink,
              backgroundColor: colors.sky,
            }}
          >
            <RotateCcw size={17} color={colors.ink} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ ...mobileType.bodySmall, fontWeight: '700', color: colors.ink }}>
                Review follow-ups
              </Text>
              <Text numberOfLines={1} style={{ ...mobileType.label, color: colors.neutral[600] }}>
                {reviewCandidates.length} {reviewCandidates.length === 1 ? 'item needs' : 'items need'} your attention
              </Text>
            </View>
            <Text style={{ ...mobileType.label, fontWeight: '700', color: colors.ink }}>Review</Text>
          </Pressable>
        ) : null}
      </View>
      {query.isCold ? <LoopsSkeleton /> : (
        <FlatList testID="loops-list" data={visible} renderItem={({ item }) => <LoopRow item={item} onOpen={() => router.push({ pathname: '/loops/[id]', params: { id: item.id } })} onToggle={() => patch.mutate({ id: item.id, status: isLoopClosed(item) ? 'open' : 'done' })} onWait={isLoopClosed(item) ? undefined : () => patch.mutate({ id: item.id, owner: item.owner === 'them' ? 'me' : 'them', status: item.owner === 'them' ? 'open' : 'waiting' })} onSnooze={isLoopClosed(item) ? undefined : () => setSnoozeTarget(item)} />} keyExtractor={item => item.id} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: 112 }} refreshControl={<RefreshControl refreshing={query.isRefetching || attentionQuery.isRefetching} onRefresh={() => { void query.refetch(); void attentionQuery.refetch(); }} tintColor={colors.ink} />} ListEmptyComponent={<MobileState title={filter === 'done' ? 'Nothing closed yet' : filter === 'waiting' ? "You're not waiting on anyone" : 'No open loops'} message="Claire will surface commitments from your conversations here." />} />
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

      <BottomSheet
        visible={reviewOpen}
        title="Review follow-ups"
        onClose={() => setReviewOpen(false)}
        testID="loop-review-sheet"
        snapPoints={['62%']}
      >
        {reviewTarget ? (
          <View style={{ paddingHorizontal: space[4], gap: space[4] }}>
            <Text style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>
              {reviewCandidates.length} {reviewCandidates.length === 1 ? 'LOOP LEFT' : 'LOOPS LEFT'}
            </Text>
            <Animated.View
              key={reviewTarget.id}
              entering={FadeInRight.duration(220)}
              exiting={FadeOutLeft.duration(150)}
              style={{ padding: space[4], borderRadius: radius.card, borderWidth: 1, borderColor: colors.neutral[200], backgroundColor: colors.cream, gap: space[2] }}
            >
              <Text selectable style={{ ...mobileType.sectionTitle, color: colors.ink }}>
                {reviewTarget.title?.trim() || reviewTarget.content}
              </Text>
              {reviewTarget.state_summary ? (
                <Text selectable style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>
                  {reviewTarget.state_summary}
                </Text>
              ) : null}
              <Text style={{ ...mobileType.label, color: colors.neutral[600] }}>
                {attentionQuery.data?.find(item => item.loop_id === reviewTarget.id)?.next_action || 'Review your next action.'}
              </Text>
            </Animated.View>
            <ReviewButton
              testID="loop-review-done"
              label="Mark as closed"
              icon={Check}
              tone="primary"
              disabled={review.isPending}
              onPress={() => review.mutate({ id: reviewTarget.id, action: 'done' })}
            />
            <View style={{ flexDirection: 'row', gap: space[2] }}>
              <View style={{ flex: 1 }}>
                <ReviewButton
                  testID="loop-review-keep"
                  label="Keep open"
                  icon={RotateCcw}
                  disabled={review.isPending}
                  onPress={() => review.mutate({ id: reviewTarget.id, action: 'keep_open' })}
                />
              </View>
              <View style={{ flex: 1 }}>
                <ReviewButton
                  testID="loop-review-dismiss"
                  label="Dismiss"
                  icon={XCircle}
                  tone="danger"
                  disabled={review.isPending}
                  onPress={() => review.mutate({ id: reviewTarget.id, action: 'dismiss' })}
                />
              </View>
            </View>
            {review.error ? (
              <Text selectable style={{ ...mobileType.bodySmall, color: colors.danger }}>
                {userFacingErrorMessage(review.error)}
              </Text>
            ) : null}
          </View>
        ) : null}
      </BottomSheet>

    </View>
  );
}
