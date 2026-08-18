/**
 * Pure loop display rules.
 *
 * Deliberately free of any import that touches the network or Supabase, so
 * these can be unit-tested directly — the rules here (derived overdue, honest
 * deadline precision) have each already been a real bug.
 */

import type { DeadlinePrecision, LoopItem, LoopStatus } from './loop-types';

export const LIVE_STATUSES: LoopStatus[] = ['open', 'waiting', 'snoozed'];

/**
 * Overdue is derived, never stored.
 *
 * `snoozed_until` takes precedence because it is when the loop next needs
 * attention; `deadline` survives underneath it unchanged.
 */
export function isOverdue(item: Pick<LoopItem, 'snoozed_until' | 'deadline' | 'status'>): boolean {
  const due = item.snoozed_until || item.deadline;
  return !!due && new Date(due) < new Date() && LIVE_STATUSES.includes(item.status);
}

/**
 * Render a deadline as precisely as it is actually known.
 *
 * A loop whose precision is `week` must not display a fabricated time of day —
 * showing "Friday 12:00" for "sometime next week" is the system inventing a
 * commitment the user never made.
 */
export function formatDeadline(
  deadline: string | null | undefined,
  precision: DeadlinePrecision | null | undefined,
): string | null {
  if (!deadline) return null;
  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) return null;

  switch (precision) {
    case 'exact':
      return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    case 'week':
      return `week of ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
    case 'month':
      return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    case 'none':
      return null;
    case 'day':
    default:
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
}

export function loopTitle(item: Pick<LoopItem, 'title' | 'content'>): string {
  return item.title || item.content || 'Untitled loop';
}

export function conversationName(item: Pick<LoopItem, 'chat' | 'contact' | 'contact_name'>): string {
  return (
    item.chat?.name ||
    item.contact?.name ||
    item.contact?.inferred_name ||
    item.chat?.contact?.name ||
    item.chat?.contact?.inferred_name ||
    item.contact_name ||
    'Personal reminder'
  );
}
