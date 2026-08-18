import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronLeft, Clock3, MessageCircle, RotateCcw, Trash2, UserRound } from 'lucide-react-native';
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
  snoozeLoop,
  updateLoop,
  type LoopDetail,
  type LoopParticipant,
} from '../../services/loops';
import { LoopAgentPanel } from './loop-agent-panel';
import { LoopBlocks } from './loop-blocks';
import { LoopTimeline } from './loop-timeline';

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
      {participant.role === 'owner' ? (
        <Text style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>OWNER</Text>
      ) : null}
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

  const query = useQuery({
    queryKey: ['loop-detail', id],
    enabled: !!id && !!user?.id,
    queryFn: () => fetchLoopDetail(String(id)),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['loop-detail', id] });
    void queryClient.invalidateQueries({ queryKey: ['mobile-loops', user?.id] });
  };

  const patch = useMutation({
    mutationFn: (next: Parameters<typeof updateLoop>[1]) => updateLoop(String(id), next),
    onSuccess: invalidate,
  });

  const snooze = useMutation({
    mutationFn: (until: string) => snoozeLoop(String(id), until),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: () => deleteLoop(String(id)),
    onSuccess: () => {
      invalidate();
      router.back();
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
          message={query.error instanceof Error ? query.error.message : 'It may have been deleted.'}
        />
      </View>
    );
  }

  const overdue = isOverdue(loop);
  const done = loop.status === 'done';
  const chatName = conversationName(loop);
  const group = !!loop.chat?.is_group;
  const due = formatDeadline(loop.deadline, loop.deadline_precision);
  const snoozedUntil = formatDeadline(loop.snoozed_until, 'exact');

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
            backgroundColor: done ? colors.lime : overdue ? colors.blush : colors.paper,
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
        </View>

        {/* Actions */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          <View style={{ flex: 1, minWidth: 140 }}>
            <ActionButton
              testID="loop-detail-toggle"
              label={done ? 'Reopen' : 'Mark done'}
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
            <LoopAgentPanel loopId={String(id)} />
          </Section>
        ) : null}

        <WhySurfaced loop={loop} />

        <Section title="History">
          <LoopTimeline events={loop.events ?? []} />
        </Section>

        <ActionButton
          testID="loop-detail-delete"
          label="Delete this loop"
          icon={Trash2}
          tone="danger"
          disabled={remove.isPending}
          onPress={() => remove.mutate()}
        />
      </ScrollView>
    </View>
  );
}
