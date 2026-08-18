import { Text, View } from 'react-native';
import {
  CheckCircle2,
  GitMerge,
  MessageSquare,
  Pencil,
  Plug,
  Sparkles,
  Clock3,
  EyeOff,
} from 'lucide-react-native';
import { colors, mobileType, radius, space } from '@claire/design-system';

import type { LoopEvent, LoopEventKind } from '../../services/loops';

/**
 * The loop's history, oldest first.
 *
 * This is the answer to "why does Claire think this?". Evidence renders as the
 * actual message so the user can check Claire's reasoning against what was
 * really said, rather than trusting a summary.
 */

interface EventStyle {
  icon: typeof MessageSquare;
  tint: string;
  label: string;
}

const EVENT_STYLES: Record<LoopEventKind, EventStyle> = {
  created: { icon: Sparkles, tint: colors.lime, label: 'Opened' },
  evidence: { icon: MessageSquare, tint: colors.sky, label: 'From the conversation' },
  state_change: { icon: Clock3, tint: colors.sky, label: 'Updated' },
  deadline_change: { icon: Clock3, tint: colors.sky, label: 'Date changed' },
  owner_change: { icon: Pencil, tint: colors.sky, label: 'Owner changed' },
  merged: { icon: GitMerge, tint: colors.blush, label: 'Merged' },
  user_edit: { icon: Pencil, tint: colors.blush, label: 'You edited this' },
  reminder_sent: { icon: Clock3, tint: colors.neutral[200], label: 'Reminder sent' },
  plugin_proposed: { icon: Plug, tint: colors.blush, label: 'Action proposed' },
  plugin_executed: { icon: Plug, tint: colors.lime, label: 'Action taken' },
  agent_note: { icon: Sparkles, tint: colors.blush, label: 'Claire noted' },
  resolved: { icon: CheckCircle2, tint: colors.lime, label: 'Closed' },
  reopened: { icon: Clock3, tint: colors.blush, label: 'Reopened' },
  suppressed: { icon: EyeOff, tint: colors.neutral[200], label: 'Not surfaced' },
};

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function LoopTimelineRow({ event, isLast }: { event: LoopEvent; isLast: boolean }) {
  const style = EVENT_STYLES[event.kind] ?? EVENT_STYLES.state_change;
  const Icon = style.icon;
  const isEvidence = event.kind === 'evidence';

  return (
    <View testID={`loop-event-${event.id}`} style={{ flexDirection: 'row', gap: space[3] }}>
      {/* Rail: the dot marks the moment, the line joins it to the next one. */}
      <View style={{ alignItems: 'center', width: 28 }}>
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: style.tint,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon size={15} color={colors.ink} />
        </View>
        {!isLast ? (
          <View style={{ flex: 1, width: 1, backgroundColor: colors.neutral[200], marginVertical: 4 }} />
        ) : null}
      </View>

      <View style={{ flex: 1, minWidth: 0, paddingBottom: isLast ? 0 : space[4], gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <Text style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>
            {style.label.toUpperCase()}
          </Text>
          <Text style={{ ...mobileType.monoLabel, color: colors.neutral[400] }}>
            {formatWhen(event.occurred_at)}
          </Text>
        </View>

        {event.summary ? (
          isEvidence ? (
            // Quoted verbatim, so the user can audit the reasoning rather than
            // take Claire's word for it.
            <View
              style={{
                padding: space[3],
                borderRadius: radius.card,
                backgroundColor: colors.paper,
                borderWidth: 1,
                borderColor: colors.neutral[200],
              }}
            >
              <Text selectable style={{ ...mobileType.bodySmall, color: colors.ink }}>
                {event.summary}
              </Text>
            </View>
          ) : (
            <Text selectable style={{ ...mobileType.bodySmall, color: colors.ink }}>
              {event.summary}
            </Text>
          )
        ) : null}
      </View>
    </View>
  );
}

export function LoopTimeline({ events }: { events: LoopEvent[] }) {
  if (!events.length) {
    return (
      <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>
        Nothing recorded yet.
      </Text>
    );
  }

  return (
    <View testID="loop-timeline">
      {events.map((event, index) => (
        <LoopTimelineRow key={event.id} event={event} isLast={index === events.length - 1} />
      ))}
    </View>
  );
}
