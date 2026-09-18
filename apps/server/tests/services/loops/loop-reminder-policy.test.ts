import { describe, expect, it } from 'bun:test';
import { planLoopReminder } from '../../../src/services/loops/loop-reminder-policy';

const now = new Date('2026-09-08T15:00:00.000Z');
const base = {
  status: 'open', visibility: 'surfaced', owner: 'me', threadState: 'agreed',
  priorityScore: 60, timezone: 'America/Mexico_City', now,
};

describe('planLoopReminder', () => {
  it('returns at the exact time chosen by a snooze', () => {
    const plan = planLoopReminder({ ...base, status: 'snoozed', snoozedUntil: '2026-09-09T18:00:00.000Z' });
    expect(plan).toEqual({ state: 'scheduled', at: new Date('2026-09-09T18:00:00.000Z'), reason: 'snooze_ended' });
  });

  it('alerts immediately when an owned loop enters act-now priority', () => {
    const plan = planLoopReminder({ ...base, priorityScore: 84 });
    expect(plan).toEqual({ state: 'scheduled', at: now, reason: 'act_now' });
  });

  it('uses two hours before an exact deadline', () => {
    const plan = planLoopReminder({ ...base, deadline: '2026-09-10T20:00:00.000Z', deadlinePrecision: 'exact' });
    expect(plan).toEqual({ state: 'scheduled', at: new Date('2026-09-10T18:00:00.000Z'), reason: 'deadline_soon' });
  });

  it('uses 09:00 local time for a day-level deadline', () => {
    const plan = planLoopReminder({ ...base, deadline: '2026-09-10T18:00:00.000Z', deadlinePrecision: 'day' });
    expect(plan).toEqual({ state: 'scheduled', at: new Date('2026-09-10T15:00:00.000Z'), reason: 'deadline_soon' });
  });

  it('waits until the follow-up window for loops owed by someone else', () => {
    const plan = planLoopReminder({ ...base, status: 'waiting', owner: 'them', deadline: '2026-09-11T15:00:00.000Z' });
    expect(plan).toEqual({ state: 'scheduled', at: new Date('2026-09-11T15:00:00.000Z'), reason: 'follow_up' });
  });

  it('uses a calm local-morning follow-up for a day-level waiting loop', () => {
    const plan = planLoopReminder({
      ...base,
      status: 'waiting',
      owner: 'them',
      deadline: '2026-09-11T06:00:00.000Z',
      deadlinePrecision: 'day',
    });
    expect(plan).toEqual({ state: 'scheduled', at: new Date('2026-09-11T15:00:00.000Z'), reason: 'follow_up' });
  });

  it('keeps proposals and undated low-priority loops quiet', () => {
    expect(planLoopReminder({ ...base, threadState: 'proposed' })).toEqual({ state: 'quiet', reason: 'not_actionable' });
    expect(planLoopReminder(base)).toEqual({ state: 'quiet', reason: 'no_timing_signal' });
  });
});
