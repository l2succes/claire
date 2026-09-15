/**
 * Group classification — heuristics, and the guards that keep them cheap.
 *
 * The heuristic path is pure, so it is table-tested directly. The two
 * assertions that matter beyond correctness are the ones about *not* calling
 * the model: those are the whole cost argument for shipping this at all.
 */

import { describe, it, expect } from 'bun:test';
import {
  classifyByHeuristics,
  CATEGORY_DISPLAY_THRESHOLD,
  GROUP_CATEGORIES,
  type HeuristicInput,
} from '../../src/services/group-classifier';

function input(overrides: Partial<HeuristicInput> = {}): HeuristicInput {
  return {
    name: 'Some Group',
    memberCount: 8,
    messageCount: 120,
    selfMessageCount: 14,
    ...overrides,
  };
}

describe('group classifier — name signals', () => {
  const cases: Array<[string, string]> = [
    ['Building 4B Residents', 'community'],
    ['HOA Board', 'community'],
    ['Grade 3 Parents', 'community'],
    ['Oakwood School Run', 'community'],
    ['Family', 'family'],
    ['Siblings ❤️', 'family'],
    ['Lisbon Trip 2026', 'planning'],
    ["Sarah's Birthday 🎉", 'planning'],
    ['Bachelorette Weekend', 'planning'],
    ['Eng Standup', 'work'],
    ['Sprint Planning', 'work'],
    ['Client — Acme', 'work'],
  ];

  for (const [name, expected] of cases) {
    it(`reads "${name}" as ${expected}`, () => {
      const result = classifyByHeuristics(input({ name }));
      expect(result?.category).toBe(expected as never);
      expect(result!.confidence).toBeGreaterThanOrEqual(CATEGORY_DISPLAY_THRESHOLD);
    });
  }

  it('prefers community over work when a name could be read as either', () => {
    // "Parents Committee" contains "committee"; without ordering it would read
    // as a work group and get a recommendation it should not have.
    expect(classifyByHeuristics(input({ name: 'Parents Committee' }))?.category).toBe('community');
  });

  it('returns a reason written for the user, not for a log', () => {
    const result = classifyByHeuristics(input({ name: 'Eng Standup' }));
    expect(result!.reason.length).toBeGreaterThan(0);
    expect(result!.reason.split(' ').length).toBeLessThanOrEqual(14);
  });

  it('only ever returns a declared category', () => {
    const result = classifyByHeuristics(input({ name: 'Lisbon Trip 2026' }));
    expect(GROUP_CATEGORIES).toContain(result!.category);
  });
});

describe('group classifier — shape signals', () => {
  it('calls a large room the user never posts in an announcement', () => {
    const result = classifyByHeuristics(
      input({ name: 'Neighborhood Updates 2', memberCount: 210, selfMessageCount: 0 })
    );
    expect(result?.category).toBe('announcement');
  });

  it('does not call a large room an announcement once the user speaks in it', () => {
    const result = classifyByHeuristics(
      input({ name: 'Announcements Channel', memberCount: 210, selfMessageCount: 6 })
    );
    // Inconclusive, not a confident label — this is the case the model exists for.
    expect(result).toBeNull();
  });

  it('is inconclusive for a small unnamed-pattern group', () => {
    expect(classifyByHeuristics(input({ name: 'Thursday' }))).toBeNull();
  });
});

describe('group classifier — cost guards', () => {
  it('declines to classify a group with too little history', () => {
    // Not "unknown": a six-message group has no character yet, and spending a
    // call to discover that is the exact waste this path exists to avoid.
    expect(classifyByHeuristics(input({ messageCount: 6 }))).toBeNull();
  });

  it('declines even when the name would otherwise be decisive', () => {
    expect(classifyByHeuristics(input({ name: 'Eng Standup', messageCount: 3 }))).toBeNull();
  });

  it('handles a group with no name at all', () => {
    expect(() => classifyByHeuristics(input({ name: null }))).not.toThrow();
  });
});
