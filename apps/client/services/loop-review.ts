import type { LoopEvent, LoopItem } from './loop-types';

const DAY_MS = 86_400_000;
const REVIEW_AFTER_DAYS: Partial<Record<NonNullable<LoopItem['thread_state']>, number>> = {
  pending_confirmation: 14,
  agreed: 30,
};

export interface PendingCloseSuggestion {
  eventId: string;
  summary: string;
  resolution: 'fulfilled' | 'cancelled' | 'expired' | 'superseded';
}

function suggestedResolution(event: LoopEvent): PendingCloseSuggestion['resolution'] | null {
  const value = event.payload?.suggestedResolution;
  return value === 'fulfilled' || value === 'cancelled' || value === 'expired' || value === 'superseded'
    ? value
    : null;
}

/** The latest close suggestion that the user has not already acted on. */
export function pendingCloseSuggestion(events: LoopEvent[]): PendingCloseSuggestion | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.kind !== 'agent_note') continue;
    const resolution = suggestedResolution(event);
    if (!resolution) continue;

    const consumed = events.slice(index + 1).some((later) =>
      later.kind === 'resolved'
      || later.kind === 'reopened'
      || later.payload?.reviewedSuggestionEventId === event.id,
    );
    if (consumed) return null;

    return {
      eventId: event.id,
      summary: event.summary?.replace(/^Claire thinks this is done:\s*/i, '') || 'The conversation may have resolved this.',
      resolution,
    };
  }
  return null;
}

function validTime(value?: string | null): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

/**
 * Old agreed work is reviewed, never silently closed. Merely proposed work is
 * handled by the server's conservative seven-day expiry rule instead.
 */
export function loopNeedsReview(loop: LoopItem, now = new Date()): boolean {
  if (!['open', 'waiting', 'snoozed'].includes(loop.status)) return false;
  if (loop.visibility && loop.visibility !== 'surfaced') return false;

  const days = loop.thread_state ? REVIEW_AFTER_DAYS[loop.thread_state] : undefined;
  if (!days) return false;

  const activity = validTime(loop.last_evidence_at) ?? validTime(loop.updated_at) ?? validTime(loop.created_at);
  if (activity === null || now.getTime() - activity < days * DAY_MS) return false;

  const reviewed = validTime(loop.reviewed_at);
  return reviewed === null || reviewed < activity;
}
