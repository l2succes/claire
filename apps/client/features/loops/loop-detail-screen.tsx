import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, CheckCircle2, ChevronLeft, Clock3, MessageCircle, RotateCcw, XCircle, UserRound } from 'lucide-react-native';
import { colors, mobileType, radius, space } from '@claire/design-system';

import { MobileHeader, MobileIconButton, MobileState } from '../../components/mobile/claire-mobile';
import { useAuthStore } from '../../stores/authStore';
import {
  conversationName,
  deleteLoop,
  fetchLoopDetail,
  formatDeadline,
  isOverdue,
  loopTitle,
  reviewLoop,
  snoozeLoop,
  updateLoop,
  type LoopDetail,
  type LoopItem,
  type LoopParticipant,
} from '../../services/loops';
import { pendingCloseSuggestion } from '../../services/loop-review';
import { LoopAgentPanel } from './loop-agent-panel';
import { LoopBlocks } from './loop-blocks';
import { LoopTimeline } from './loop-timeline';
import { userFacingErrorMessage } from '../../services/api-errors';
import { cacheLoop, deleteCachedLoop } from '../../services/mobile-cache';
import {
  invalidateLoopQueries,
  patchLoopQueries,
  removeLoopFromQueries,
  restoreLoopQueries,
  snapshotLoopQueries,
} from '../../services/loop-query-cache';

/**
 * Where a loop is actually resolved.
 *
 * Before this screen existed, tapping a loop jumped straight into the chat —
 * so snooze, notes, ownership, and delete existed in the API but nowhere in the
 * product. Opening the conversation is now a secondary action, not the only one.
 */

const OWNER_LABEL: Record<string, string> = {
  me: 'You owe this',
  them: 'Waiting on them',
  shared: 'Shared',
  unknown: 'Unassigned',
};

/**
 * How settled the plan is. Deliberately surfaced: a `proposed` loop is not a
 * commitment yet, and showing it as one is how a follow-up list stops being
 * trusted.
 */
const STATE_LABEL: Record<string, string> = {
  proposed: 'Floated, not agreed',
  negotiating: 'Being worked out',
  pending_confirmation: 'Waiting on confirmation',
  agreed: 'Agreed',
  resolved: 'Resolved',
};

const REMINDER_LABEL: Record<string, string> = {
  snooze_ended: 'Returns after snooze',
  act_now: 'Needs attention',
  deadline_soon: 'Before the deadline',
  follow_up: 'Follow-up window',
};

/** A tappable pill. Static style plus press state — see the Pressable gotcha in CLAUDE.md. */
function ActionButton({
  label,
  icon: Icon,
  onPress,
  testID,
  tone = 'neutral',
  disabled,
}: {
  label: string;
  icon: typeof Check;
  onPress: () => void;
  testID: string;
  tone?: 'neutral' | 'primary' | 'danger';
  disabled?: boolean;
}) {
  const [pressed, setPressed] = useState(false);
  const background =
    tone === 'primary' ? colors.ink : tone === 'danger' ? colors.blush : colors.paper;
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
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space[2],
        minHeight: 44,
        paddingHorizontal: space[4],
        borderRadius: radius.control,
        borderWidth: tone === 'neutral' ? 1 : 0,
        borderColor: colors.neutral[200],
        backgroundColor: background,
        opacity: disabled ? 0.45 : pressed ? 0.78 : 1,
      }}
    >
      <Icon size={17} color={foreground} />
      <Text style={{ ...mobileType.bodySmall, fontWeight: '700', color: foreground }}>{label}</Text>
    </Pressable>
  );
}

function BackButton() {
  return (
    <MobileIconButton label="Back" testID="loop-detail-back" onPress={() => router.back()}>
      <ChevronLeft size={21} color={colors.ink} />
    </MobileIconButton>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: space[3] }}>
      <Text style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}

function ParticipantRow({ participant }: { participant: LoopParticipant }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: participant.is_self ? colors.lime : colors.blush,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <UserRound size={14} color={colors.neutral[600]} />
      </View>
      <Text style={{ ...mobileType.bodySmall, flex: 1, color: colors.ink }}>
        {participant.is_self ? 'You' : participant.display_name}
      </Text>
    </View>
  );
}

/** Why this loop was surfaced, in the user's words rather than signal ids. */
function WhySurfaced({ loop }: { loop: LoopDetail }) {
  const reasons = loop.relevance_signals?.reasons ?? [];
  if (!reasons.length && !loop.suppressed_reason) return null;

  return (
    <Section title={loop.suppressed_reason ? 'Why this is hidden' : 'Why Claire surfaced this'}>
      <View
        style={{
          padding: space[4],
          borderRadius: radius.card,
          backgroundColor: colors.paper,
          borderWidth: 1,
          borderColor: colors.neutral[200],
          gap: space[2],
        }}
      >
        {reasons.map((reason) => (
          <Text key={reason} style={{ ...mobileType.bodySmall, color: colors.ink }}>
            • {reason}
          </Text>
        ))}
        {loop.suppressed_reason ? (
          <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>
            Hidden because: {loop.suppressed_reason.replace(/_/g, ' ')}
          </Text>
        ) : null}
      </View>
    </Section>
  );
}

export function LoopDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  // Opening from the list should paint the loop the person just tapped before
  // its timeline and participants finish downloading. The detail request still
  // runs immediately and replaces this lightweight list shape when it lands.
  const listLoop = queryClient
    .getQueryData<LoopItem[]>(['mobile-loops', user?.id])
    ?.find((item) => item.id === String(id));

  const query = useQuery({
    queryKey: ['loop-detail', id],
    enabled: !!id && !!user?.id,
    queryFn: () => fetchLoopDetail(String(id)),
    initialData: listLoop as LoopDetail | undefined,
    initialDataUpdatedAt: listLoop ? 0 : undefined,
  });

  const loopId = String(id);
  const beginOptimisticPatch = async (next: Partial<LoopItem>) => {
    await Promise.all([
      queryClient.cancelQueries({ queryKey: ['loop-detail', loopId] }),
      queryClient.cancelQueries({ queryKey: ['mobile-loops', user?.id] }),
      queryClient.cancelQueries({ queryKey: ['mobile-home-loops', user?.id] }),
      queryClient.cancelQueries({ queryKey: ['loop-attention', user?.id] }),
    ]);
    const snapshot = snapshotLoopQueries(queryClient, user?.id, loopId);
    patchLoopQueries(queryClient, user?.id, loopId, next);
    return { snapshot };
  };

  const persistSuccessfulMutation = async (updated: LoopItem) => {
    patchLoopQueries(queryClient, user?.id, loopId, updated);
    if (user?.id) await cacheLoop(user.id, updated as unknown as Record<string, unknown>);
    await invalidateLoopQueries(queryClient, user?.id, loopId);
  };

  const patch = useMutation({
    mutationFn: (next: Parameters<typeof updateLoop>[1]) => updateLoop(loopId, next, query.data?.row_version),
    onMutate: beginOptimisticPatch,
    onSuccess: persistSuccessfulMutation,
    onError: (_error, _variables, context) => {
      if (context?.snapshot) restoreLoopQueries(queryClient, user?.id, loopId, context.snapshot);
    },
  });

  const snooze = useMutation({
    mutationFn: (until: string) => snoozeLoop(loopId, until),
    onMutate: (until) => beginOptimisticPatch({ status: 'snoozed', snoozed_until: until }),
    onSuccess: persistSuccessfulMutation,
    onError: (_error, _variables, context) => {
      if (context?.snapshot) restoreLoopQueries(queryClient, user?.id, loopId, context.snapshot);
    },
  });

  const remove = useMutation({
    mutationFn: () => deleteLoop(loopId),
    onMutate: async () => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ['loop-detail', loopId] }),
        queryClient.cancelQueries({ queryKey: ['mobile-loops', user?.id] }),
        queryClient.cancelQueries({ queryKey: ['mobile-home-loops', user?.id] }),
        queryClient.cancelQueries({ queryKey: ['loop-attention', user?.id] }),
      ]);
      const snapshot = snapshotLoopQueries(queryClient, user?.id, loopId);
      removeLoopFromQueries(queryClient, user?.id, loopId);
      return { snapshot };
    },
    onSuccess: async () => {
      if (user?.id) await deleteCachedLoop(user.id, loopId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mobile-loops', user?.id] }),
        queryClient.invalidateQueries({ queryKey: ['mobile-home-loops', user?.id] }),
        queryClient.invalidateQueries({ queryKey: ['loop-attention', user?.id] }),
      ]);
      router.back();
    },
    onError: (_error, _variables, context) => {
      if (context?.snapshot) restoreLoopQueries(queryClient, user?.id, loopId, context.snapshot);
    },
  });

  const review = useMutation({
    mutationFn: (input: Parameters<typeof reviewLoop>[1]) => reviewLoop(loopId, input),
    onMutate: (input) => beginOptimisticPatch(input.action === 'done'
      ? { status: 'done', thread_state: 'resolved' }
      : input.action === 'dismiss'
        ? { status: 'dropped', thread_state: 'resolved' }
        : { reviewed_at: new Date().toISOString() }),
    onSuccess: persistSuccessfulMutation,
    onError: (_error, _variables, context) => {
      if (context?.snapshot) restoreLoopQueries(queryClient, user?.id, loopId, context.snapshot);
    },
  });

  const loop = query.data;

  if (query.isLoading) {
    return (
      <View testID="loop-detail-screen" style={{ flex: 1, backgroundColor: colors.cream }}>
        <MobileHeader title="Loop" safeArea leading={<BackButton />} />
        <MobileState title="Loading…" message="Fetching this loop." />
      </View>
    );
  }

  if (query.isError || !loop) {
    return (
      <View testID="loop-detail-screen" style={{ flex: 1, backgroundColor: colors.cream }}>
        <MobileHeader title="Loop" safeArea leading={<BackButton />} />
        <MobileState
          title="Could not open this loop"
          message={userFacingErrorMessage(query.error, 'It may have been deleted.')}
        />
      </View>
    );
  }

  const overdue = isOverdue(loop);
  const done = ['done', 'dropped', 'superseded'].includes(loop.status);
  const chatName = conversationName(loop);
  const group = !!loop.chat?.is_group;
  const due = formatDeadline(loop.deadline, loop.deadline_precision);
  const snoozedUntil = formatDeadline(loop.snoozed_until, 'exact');
  const nextReminder = formatDeadline(loop.next_reminder_at, 'exact');
  const closeSuggestion = pendingCloseSuggestion(loop.events ?? [], loop.row_version, loop.chat_generation);

  const tomorrow = () => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    date.setHours(9, 0, 0, 0);
    return date.toISOString();
  };

  return (
    <View testID="loop-detail-screen" style={{ flex: 1, backgroundColor: colors.cream }}>
      <MobileHeader title="Loop" subtitle={chatName} safeArea leading={<BackButton />} />

      <ScrollView
        contentContainerStyle={{ padding: space[4], paddingBottom: 132, gap: space[5] }}
        contentInsetAdjustmentBehavior="automatic"
      >
        {/* State card */}
        <View
          style={{
            padding: space[4],
            borderRadius: radius.card,
            backgroundColor: loop.status === 'done' ? colors.lime : overdue ? colors.blush : colors.paper,
            borderWidth: 1,
            borderColor: colors.neutral[200],
            gap: space[3],
          }}
        >
          <Text
            testID="loop-detail-title"
            selectable
            style={{
              ...mobileType.sectionTitle,
              color: colors.ink,
              textDecorationLine: done ? 'line-through' : 'none',
            }}
          >
            {loopTitle(loop)}
          </Text>

          {/* The evolving narrative — the single most useful new field. */}
          {loop.state_summary ? (
            <Text testID="loop-detail-summary" selectable style={{ ...mobileType.body, color: colors.ink }}>
              {loop.state_summary}
            </Text>
          ) : null}

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
            <Text style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>
              {OWNER_LABEL[loop.owner ?? 'unknown']}
            </Text>
            {loop.thread_state ? (
              <Text testID="loop-detail-state" style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>
                · {STATE_LABEL[loop.thread_state] ?? loop.thread_state}
              </Text>
            ) : null}
          </View>

          {/* Deadline and snooze shown together: snoozing must never look like
              it changed the date the user committed to. */}
          {due ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
              <Clock3 size={15} color={overdue ? colors.danger : colors.neutral[600]} />
              <Text
                testID="loop-detail-deadline"
                style={{ ...mobileType.bodySmall, color: overdue ? colors.danger : colors.neutral[600] }}
              >
                Due {due}
                {overdue ? ' · overdue' : ''}
              </Text>
            </View>
          ) : null}
          {snoozedUntil ? (
            <Text testID="loop-detail-snoozed" style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>
              Snoozed until {snoozedUntil}
            </Text>
          ) : null}
          {loop.reminder_plan_state === 'scheduled' && nextReminder ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
              <Bell size={15} color={colors.neutral[600]} />
              <Text testID="loop-detail-next-reminder" style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>
                {REMINDER_LABEL[loop.reminder_reason ?? ''] ?? 'Reminder'} · {nextReminder}
              </Text>
            </View>
          ) : null}
        </View>

        {closeSuggestion && !done ? (
          <View
            testID="loop-close-suggestion"
            style={{
              padding: space[4],
              borderRadius: radius.card,
              borderWidth: 1,
              borderColor: colors.ink,
              backgroundColor: colors.sky,
              gap: space[3],
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
              <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle2 size={15} color={colors.ink} />
              </View>
              <Text selectable style={{ ...mobileType.body, flex: 1, fontWeight: '700', color: colors.ink }}>
                Claire thinks this loop is finished
              </Text>
            </View>
            <Text selectable style={{ ...mobileType.bodySmall, color: colors.ink }}>
              {closeSuggestion.summary}
            </Text>
            <View style={{ flexDirection: 'row', gap: space[2] }}>
              <View style={{ flex: 1 }}>
                <ActionButton
                  testID="loop-close-suggestion-accept"
                  label="Mark as closed"
                  icon={Check}
                  tone="primary"
                  disabled={review.isPending}
                  onPress={() => review.mutate({
                    action: 'done',
                    resolution: closeSuggestion.resolution,
                    suggestionEventId: closeSuggestion.eventId,
                  })}
                />
              </View>
              <View style={{ flex: 1 }}>
                <ActionButton
                  testID="loop-close-suggestion-keep"
                  label="Keep open"
                  icon={RotateCcw}
                  disabled={review.isPending}
                  onPress={() => review.mutate({
                    action: 'keep_open',
                    suggestionEventId: closeSuggestion.eventId,
                  })}
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

        {/* Actions */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          <View style={{ flex: 1, minWidth: 140 }}>
            <ActionButton
              testID="loop-detail-toggle"
              label={done ? 'Reopen' : 'Mark as closed'}
              icon={done ? RotateCcw : Check}
              tone="primary"
              disabled={patch.isPending}
              onPress={() => patch.mutate({ status: done ? 'open' : 'done' })}
            />
          </View>
          {!done ? (
            <View style={{ flex: 1, minWidth: 140 }}>
              <ActionButton
                testID="loop-detail-snooze"
                label="Snooze to tomorrow"
                icon={Clock3}
                disabled={snooze.isPending}
                onPress={() => snooze.mutate(tomorrow())}
              />
            </View>
          ) : null}
        </View>

        {patch.error || snooze.error || remove.error ? (
          <Text testID="loop-mutation-error" selectable style={{ ...mobileType.bodySmall, color: colors.danger }}>
            {userFacingErrorMessage(patch.error || snooze.error || remove.error)}
          </Text>
        ) : null}

        {loop.chat_id ? (
          <ActionButton
            testID="loop-detail-open-chat"
            label="Open conversation"
            icon={MessageCircle}
            onPress={() =>
              router.push({
                pathname: '/chat/[chatId]',
                params: {
                  chatId: String(loop.chat_id),
                  contact_name: group ? '' : chatName,
                  chat_name: chatName,
                  platform: loop.platform || loop.chat?.platform || '',
                  is_group: group ? '1' : '0',
                },
              })
            }
          />
        ) : null}

        {loop.participants?.length ? (
          <Section title="People">
            <View style={{ gap: space[2] }}>
              {loop.participants.map((participant) => (
                <ParticipantRow key={participant.id} participant={participant} />
              ))}
            </View>
          </Section>
        ) : null}

        {loop.blocks?.length ? (
          <Section title="Actions">
            <LoopBlocks blocks={loop.blocks} />
          </Section>
        ) : null}

        {!done ? (
          <Section title="Claire">
            <LoopAgentPanel loop={loop} />
          </Section>
        ) : null}

        <WhySurfaced loop={loop} />

        <Section title="History">
          <LoopTimeline events={loop.events ?? []} />
        </Section>

        <ActionButton
          testID="loop-detail-delete"
          label="Dismiss loop"
          icon={XCircle}
          tone="danger"
          disabled={remove.isPending}
          onPress={() => remove.mutate()}
        />
      </ScrollView>
    </View>
  );
}
