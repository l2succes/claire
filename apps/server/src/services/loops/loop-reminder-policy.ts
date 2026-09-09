export type LoopReminderReason = 'snooze_ended' | 'act_now' | 'deadline_soon' | 'follow_up';

export interface LoopReminderInput {
  status: string;
  visibility: string;
  owner: string | null;
  threadState?: string | null;
  deadline?: string | null;
  deadlinePrecision?: string | null;
  snoozedUntil?: string | null;
  priorityScore?: number | null;
  timezone?: string | null;
  now?: Date;
}

export type LoopReminderPlan =
  | { state: 'quiet'; reason: 'inactive' | 'not_actionable' | 'no_timing_signal' }
  | { state: 'scheduled'; at: Date; reason: LoopReminderReason };

const HOUR_MS = 60 * 60 * 1000;

function validDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function zonedParts(date: Date, timezone: string): Record<string, number> {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(date);
    return Object.fromEntries(parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]));
  } catch {
    return zonedParts(date, 'UTC');
  }
}

/** Convert a calendar day as seen in `timezone` to 09:00 in that timezone. */
function localMorningFor(date: Date, timezone: string): Date {
  const day = zonedParts(date, timezone);
  const desiredAsUtc = Date.UTC(day.year, day.month - 1, day.day, 9, 0, 0);

  // Resolve the offset twice. The second pass handles a DST boundary between
  // the source instant and the desired local morning.
  let candidate = new Date(desiredAsUtc);
  for (let pass = 0; pass < 2; pass += 1) {
    const seen = zonedParts(candidate, timezone);
    const seenAsUtc = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute, seen.second);
    candidate = new Date(candidate.getTime() + desiredAsUtc - seenAsUtc);
  }
  return candidate;
}

/**
 * Pick one useful interruption for the current loop revision.
 *
 * This stays deterministic: the model extracts facts and ordinary code decides
 * if/when those facts deserve a notification. A later semantic change creates
 * a new revision and runs this function again.
 */
export function planLoopReminder(input: LoopReminderInput): LoopReminderPlan {
  const now = input.now ?? new Date();
  if (input.visibility !== 'surfaced' || !['open', 'waiting', 'snoozed'].includes(input.status)) {
    return { state: 'quiet', reason: 'inactive' };
  }
  if (input.threadState === 'proposed' || input.threadState === 'negotiating') {
    return { state: 'quiet', reason: 'not_actionable' };
  }

  const snoozedUntil = validDate(input.snoozedUntil);
  if (snoozedUntil && snoozedUntil > now) {
    return { state: 'scheduled', at: snoozedUntil, reason: 'snooze_ended' };
  }
  if (input.status === 'snoozed' && snoozedUntil) {
    return { state: 'scheduled', at: now, reason: 'snooze_ended' };
  }

  const deadline = validDate(input.deadline);
  const owner = input.owner ?? 'unknown';
  const userCanAct = owner === 'me' || owner === 'shared';
  const waitingOnThem = owner === 'them' || input.status === 'waiting';
  const priorityScore = Math.max(0, Math.min(100, input.priorityScore ?? 0));
  const precision = input.deadlinePrecision ?? 'exact';

  if (userCanAct && priorityScore >= 80) {
    return { state: 'scheduled', at: now, reason: 'act_now' };
  }
  if (!deadline) return { state: 'quiet', reason: 'no_timing_signal' };

  if (waitingOnThem) {
    const followUpAt = precision === 'exact'
      ? deadline
      : localMorningFor(deadline, input.timezone || 'UTC');
    return {
      state: 'scheduled',
      at: followUpAt > now ? followUpAt : now,
      reason: 'follow_up',
    };
  }
  if (!userCanAct) return { state: 'quiet', reason: 'no_timing_signal' };

  const preferred = precision === 'exact'
    ? new Date(deadline.getTime() - 2 * HOUR_MS)
    : localMorningFor(deadline, input.timezone || 'UTC');

  return {
    state: 'scheduled',
    at: preferred > now ? preferred : now,
    reason: 'deadline_soon',
  };
}
