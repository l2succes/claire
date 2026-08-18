/**
 * The loop display rules that are easy to get quietly wrong.
 *
 * Both of these have already been real bugs: snooze used to overwrite the
 * deadline, and a loop whose date is only known to the week would otherwise
 * render an invented time of day.
 */

import { formatDeadline, isOverdue, loopTitle, conversationName, LIVE_STATUSES } from '../services/loop-display';

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
