import { describe, expect, it } from 'bun:test';
import { calculateLoopPriority } from '../../../src/services/loops/loop-priority';

const now = new Date('2026-08-21T12:00:00.000Z');
const base = { status: 'open', visibility: 'surfaced', owner: 'me' as const, state: 'agreed' as const, deadline: null, confidence: 1, relevance: 1, now };

describe('calculateLoopPriority', () => {
  it('makes an overdue commitment owned by the user act-now priority', () => {
    expect(calculateLoopPriority({ ...base, deadline: '2026-08-20T12:00:00.000Z' }).score).toBeGreaterThanOrEqual(80);
  });
  it('excludes snoozed and suppressed loops from attention', () => {
    expect(calculateLoopPriority({ ...base, snoozedUntil: '2026-08-22T12:00:00.000Z' }).eligible).toBe(false);
    expect(calculateLoopPriority({ ...base, visibility: 'suppressed' }).score).toBe(0);
  });
});
