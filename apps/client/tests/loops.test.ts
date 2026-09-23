/**
 * The loop display rules that are easy to get quietly wrong.
 *
 * Both of these have already been real bugs: snooze used to overwrite the
 * deadline, and a loop whose date is only known to the week would otherwise
 * render an invented time of day.
 */

import { formatDeadline, isLoopDeferred, isOverdue, loopTitle, conversationName, LIVE_STATUSES } from '../services/loop-display';
import { loopNeedsReview, pendingCloseSuggestion } from '../services/loop-review';

describe('isOverdue', () => {
  const past = new Date(Date.now() - 86_400_000).toISOString();
  const future = new Date(Date.now() + 86_400_000).toISOString();

  it('is overdue when the deadline has passed and the loop is live', () => {
    expect(isOverdue({ deadline: past, snoozed_until: null, status: 'open' })).toBe(true);
  });

  it('is not overdue when the deadline is ahead', () => {
    expect(isOverdue({ deadline: future, snoozed_until: null, status: 'open' })).toBe(false);
  });

  it('is never overdue once the loop is done', () => {
    expect(isOverdue({ deadline: past, snoozed_until: null, status: 'done' })).toBe(false);
  });

  it('uses snoozed_until in preference to the deadline', () => {
    // Snoozing moves when the loop next needs attention...
    expect(isOverdue({ deadline: past, snoozed_until: future, status: 'snoozed' })).toBe(false);
  });

  it('hides a snoozed loop only until its reminder is due', () => {
    const now = new Date('2026-09-07T12:00:00.000Z');
    expect(isLoopDeferred({ status: 'snoozed', snoozed_until: '2026-09-07T15:00:00.000Z' }, now)).toBe(true);
    expect(isLoopDeferred({ status: 'snoozed', snoozed_until: '2026-09-07T11:00:00.000Z' }, now)).toBe(false);
    expect(isLoopDeferred({ status: 'open', snoozed_until: '2026-09-07T15:00:00.000Z' }, now)).toBe(false);
  });

  it('goes overdue again once the snooze itself lapses', () => {
    expect(isOverdue({ deadline: future, snoozed_until: past, status: 'snoozed' })).toBe(true);
  });

  it('treats open, waiting, and snoozed as live', () => {
    expect(LIVE_STATUSES).toEqual(['open', 'waiting', 'snoozed']);
  });
});

describe('formatDeadline — never invents precision it does not have', () => {
  const date = '2026-08-21T15:30:00Z';

  it('renders nothing when there is no deadline', () => {
    expect(formatDeadline(null, 'day')).toBeNull();
  });

  it('renders nothing when precision is none, even with a date present', () => {
    // A date the model could not pin down must not appear as a commitment.
    expect(formatDeadline(date, 'none')).toBeNull();
  });

  it('shows a time only when the time is actually known', () => {
    expect(formatDeadline(date, 'exact')).toMatch(/\d/);
    expect(formatDeadline(date, 'day')).not.toMatch(/:/);
  });

  it('says "week of" rather than picking a day', () => {
    expect(formatDeadline(date, 'week')).toContain('week of');
  });

  it('shows only month and year at month precision', () => {
    expect(formatDeadline(date, 'month')).toMatch(/2026/);
    expect(formatDeadline(date, 'month')).not.toMatch(/:/);
  });

  it('ignores an unparseable date instead of rendering Invalid Date', () => {
    expect(formatDeadline('not-a-date', 'day')).toBeNull();
  });
});

describe('titles and conversation names', () => {
  it('prefers the title, falling back to legacy content', () => {
    expect(loopTitle({ title: 'Send the deck', content: 'raw' })).toBe('Send the deck');
    expect(loopTitle({ title: null, content: 'raw' })).toBe('raw');
    expect(loopTitle({ title: null, content: '' })).toBe('Untitled loop');
  });

  it('falls back through chat, contact, then a personal reminder', () => {
    expect(conversationName({ chat: { name: 'Family' }, contact: null, contact_name: null })).toBe('Family');
    expect(conversationName({ chat: null, contact: { name: 'Maya' }, contact_name: null })).toBe('Maya');
    expect(conversationName({ chat: null, contact: null, contact_name: null })).toBe('Personal reminder');
  });
});

describe('loop cleanup review', () => {
  it('finds an unhandled close suggestion', () => {
    expect(pendingCloseSuggestion([{
      id: 'suggestion-1',
      kind: 'agent_note',
      actor: 'agent',
      summary: 'Claire thinks this is done: Maya confirmed receipt',
      payload: { suggestedResolution: 'fulfilled' },
      occurred_at: '2026-09-01T12:00:00.000Z',
    }])).toEqual({
      eventId: 'suggestion-1',
      resolution: 'fulfilled',
      summary: 'Maya confirmed receipt',
    });
  });

  it('does not repeat a suggestion the user kept open', () => {
    expect(pendingCloseSuggestion([
      {
        id: 'suggestion-1', kind: 'agent_note', actor: 'agent',
        payload: { suggestedResolution: 'cancelled' }, occurred_at: '2026-09-01T12:00:00.000Z',
      },
      {
        id: 'review-1', kind: 'user_edit', actor: 'user',
        payload: { reviewedSuggestionEventId: 'suggestion-1' }, occurred_at: '2026-09-01T12:01:00.000Z',
      },
    ])).toBeNull();
  });

  it('reviews an agreed loop after 30 quiet days but never treats age as completion', () => {
    const loop = {
      id: 'loop-1', content: 'Send the deck', priority: 'medium' as const,
      status: 'open' as const, from_me: true, thread_state: 'agreed' as const,
      last_evidence_at: '2026-07-01T12:00:00.000Z', visibility: 'surfaced' as const,
    };
    expect(loopNeedsReview(loop, new Date('2026-08-01T12:00:01.000Z'))).toBe(true);
    expect(loop.status).toBe('open');
  });

  it('does not requeue a loop reviewed after its latest evidence', () => {
    expect(loopNeedsReview({
      id: 'loop-1', content: 'Send the deck', priority: 'medium', status: 'open',
      from_me: true, thread_state: 'agreed', visibility: 'surfaced',
      last_evidence_at: '2026-07-01T12:00:00.000Z',
      reviewed_at: '2026-07-31T12:00:00.000Z',
    }, new Date('2026-08-15T12:00:00.000Z'))).toBe(false);
  });
});

describe('versioned close proposals', () => {
  it('hides a proposal after the underlying loop changes', () => {
    const event = { id: 'proposal', kind: 'agent_note' as const, actor: 'detector' as const, occurred_at: '2026-09-22T12:00:00Z', payload: { suggestedResolution: 'fulfilled', expectedVersion: 3 } };
    expect(pendingCloseSuggestion([event], 3)?.eventId).toBe('proposal');
    expect(pendingCloseSuggestion([event], 4)).toBeNull();
  });
});
