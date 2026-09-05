/**
 * Relevance scoring — "does this group message concern the user?"
 *
 * The worked examples in /docs/plans/loops-revamp §2 are the acceptance
 * criteria; each is reproduced here. Pure functions, no mocking.
 */

import { describe, it, expect } from 'bun:test';
import {
  scoreRelevance,
  decideRelevance,
  relevanceThreshold,
  normalizeAlias,
  normalizePhone,
  type RelevanceInput,
  type SelfIdentity,
  type WindowMessage,
} from '../../../src/services/loops/relevance';

const SELF: SelfIdentity = {
  userId: 'user-1',
  displayNames: ['luc', 'lucsucces'],
  handles: ['luc', 'lucsucces'],
  phones: ['166100494'],
  contactIds: ['15166100494'],
};

let counter = 0;
function msg(partial: Partial<WindowMessage> & { content: string }): WindowMessage {
  counter += 1;
  return {
    id: partial.id ?? `m${counter}`,
    ref: partial.ref ?? `m${counter}`,
    senderName: partial.senderName ?? 'Someone',
    isSelf: partial.isSelf ?? false,
    at: partial.at ?? '2026-08-17T12:00:00Z',
    ...partial,
  };
}

function input(overrides: Partial<RelevanceInput> = {}): RelevanceInput {
  const window = overrides.window ?? [msg({ content: 'hello' })];
  return {
    platform: 'whatsapp',
    isGroup: true,
    self: SELF,
    window,
    evidence: overrides.evidence ?? window,
    roster: [
      { identityKey: 'a', displayName: 'Aunt Rita' },
      { identityKey: 'b', displayName: 'Sam' },
      { identityKey: 'c', displayName: 'Luc', isSelf: true },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
describe('normalization', () => {
  it('strips accents, case, and punctuation from aliases', () => {
    expect(normalizeAlias('Luc-Succès!')).toBe('lucsucces');
    expect(normalizeAlias('@Luc')).toBe('luc');
  });

  it('reduces phone numbers to the last 9 digits so country codes do not matter', () => {
    expect(normalizePhone('+1 (516) 610-0494')).toBe('166100494');
    expect(normalizePhone('15166100494')).toBe(normalizePhone('+1-516-610-0494'));
  });
});

// ---------------------------------------------------------------------------
describe('hard passes', () => {
  it('always surfaces a 1:1 DM (example 2.1)', () => {
    const result = scoreRelevance(input({ isGroup: false }));
    expect(result.hardPass).toBe('dm');
    expect(result.score).toBe(1);
  });

  it('always surfaces a commitment the user made themselves (example 2.4)', () => {
    const window = [
      msg({ content: '@Luc are you bringing the drinks?', senderName: 'Aunt Rita' }),
      msg({ content: "yeah I'll grab them Friday", isSelf: true }),
    ];
    const result = scoreRelevance(input({ window, evidence: window }));
    expect(result.hardPass).toBe('self_commitment');
  });

  it('lets sensitivity=off override even a hard pass', () => {
    // "Never make loops from this conversation" has to outrank every signal,
    // or the setting does not mean what it says.
    const decision = decideRelevance(input({ isGroup: false }), 'off');
    expect(decision.surfaced).toBe(false);
    expect(decision.suppressedReason).toBe('sensitivity_off');
  });
});

// ---------------------------------------------------------------------------
describe('example 2.3 — group message about someone else is suppressed', () => {
  const window = [
    msg({ content: 'Sam, can you pick up the cake on Saturday?', senderName: 'Aunt Rita' }),
    msg({ content: 'Yep, I got it.', senderName: 'Sam' }),
  ];
  const scenario = input({
    window,
    evidence: window,
    memberCount: 6,
    llmOwner: 'them',
    llmOwnerName: 'Sam',
  });

  it('scores below the normal threshold', () => {
    const result = scoreRelevance(scenario);
    expect(result.score).toBeLessThan(relevanceThreshold('normal'));
    expect(result.addressed).toBe(false);
  });

  it('is suppressed, and says why', () => {
    const decision = decideRelevance(scenario, 'normal');
    expect(decision.surfaced).toBe(false);
    expect(decision.suppressedReason).toBe('named_other');
  });

  it('fires named_other and no_self_signal', () => {
    const hits = scoreRelevance(scenario).signals.filter((s) => s.hit).map((s) => s.id);
    expect(hits).toContain('named_other');
    expect(hits).toContain('no_self_signal');
  });
});

// ---------------------------------------------------------------------------
describe('mentions', () => {
  it('surfaces on a structured mention', () => {
    const window = [msg({ content: 'can you bring drinks?', mentions: ['15166100494'] })];
    const decision = decideRelevance(input({ window, evidence: window }), 'normal');
    expect(decision.surfaced).toBe(true);
  });

  it('surfaces on a textual @handle', () => {
    const window = [msg({ content: '@Luc are you bringing the drinks?' })];
    expect(decideRelevance(input({ window, evidence: window }), 'normal').surfaced).toBe(true);
  });

  it('matches a WhatsApp phone-number mention', () => {
    // WhatsApp renders mentions as the phone number, never the display name.
    const window = [msg({ content: '@15166100494 can you send that?' })];
    expect(decideRelevance(input({ window, evidence: window }), 'normal').surfaced).toBe(true);
  });

  it('does not match a different phone number', () => {
    const window = [msg({ content: '@19995551234 can you send that?' })];
    const hits = scoreRelevance(input({ window, evidence: window })).signals;
    expect(hits.find((s) => s.id === 'mention_exact')?.hit).toBe(false);
  });

  it('does not match a name that merely contains an alias', () => {
    // "Lucy" must not read as "Luc".
    const window = [msg({ content: 'Lucy can you grab the cake?' })];
    const hits = scoreRelevance(input({ window, evidence: window })).signals;
    expect(hits.find((s) => s.id === 'mention_exact')?.hit).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('broadcast mentions are a negative signal', () => {
  const window = [msg({ content: '@channel standup moved to 10', senderName: 'Dana' })];
  const scenario = input({ platform: 'slack', window, evidence: window, memberCount: 40 });

  it('suppresses an @channel announcement', () => {
    const decision = decideRelevance(scenario, 'normal');
    expect(decision.surfaced).toBe(false);
  });

  it('scores broadcast_mention as negative, not as a mention', () => {
    const signals = scoreRelevance(scenario).signals;
    expect(signals.find((s) => s.id === 'broadcast_mention')?.hit).toBe(true);
    expect(signals.find((s) => s.id === 'mention_exact')?.hit).toBe(false);
    expect(signals.find((s) => s.id === 'broadcast_mention')!.weight).toBeLessThan(0);
  });

  it('respects the m.mentions room flag even without the literal token', () => {
    const roomWindow = [msg({ content: 'standup moved to 10', mentionsRoom: true })];
    const signals = scoreRelevance(
      input({ platform: 'slack', window: roomWindow, evidence: roomWindow }),
    ).signals;
    expect(signals.find((s) => s.id === 'broadcast_mention')?.hit).toBe(true);
  });

  it('still surfaces when a personal mention accompanies the broadcast', () => {
    const both = [msg({ content: '@here — @Luc can you own this?', mentions: ['15166100494'] })];
    const decision = decideRelevance(
      input({ platform: 'slack', window: both, evidence: both, memberCount: 40 }),
      'normal',
    );
    expect(decision.surfaced).toBe(true);
  });

  it('treats @channel as ordinary text on platforms without broadcast syntax', () => {
    const signals = scoreRelevance(input({ platform: 'whatsapp', window, evidence: window })).signals;
    expect(signals.find((s) => s.id === 'broadcast_mention')?.hit).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('reply adjacency', () => {
  it('surfaces when a message replies to something the user sent', () => {
    const mine = msg({ content: 'I put the doc in Drive', isSelf: true });
    const reply = msg({ content: 'can you also add the numbers?', replyToId: mine.id });
    const decision = decideRelevance(input({ window: [mine, reply], evidence: [reply] }), 'normal');
    expect(decision.surfaced).toBe(true);
  });

  it('does not fire when the reply targets someone else', () => {
    const theirs = msg({ content: 'I put the doc in Drive', senderName: 'Sam' });
    const reply = msg({ content: 'can you also add the numbers?', replyToId: theirs.id });
    const signals = scoreRelevance(input({ window: [theirs, reply], evidence: [reply] })).signals;
    expect(signals.find((s) => s.id === 'reply_to_me')?.hit).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('second-person address requires adjacency', () => {
  it('fires when the user spoke just before', () => {
    const mine = msg({ content: 'I can take the migration', isSelf: true });
    const theirs = msg({ content: 'great, can you finish it by Thursday?' });
    const signals = scoreRelevance(input({ window: [mine, theirs], evidence: [theirs] })).signals;
    expect(signals.find((s) => s.id === 'second_person_after_self')?.hit).toBe(true);
  });

  it('does not fire when the user has not spoken recently', () => {
    // "you" in a group almost always means whoever spoke last, not the user.
    const window = [
      msg({ content: 'Sam, can you pick up the cake?', senderName: 'Aunt Rita' }),
      msg({ content: 'and can you also get candles?', senderName: 'Aunt Rita' }),
    ];
    const signals = scoreRelevance(input({ window, evidence: [window[1]] })).signals;
    expect(signals.find((s) => s.id === 'second_person_after_self')?.hit).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('audience size', () => {
  it('prefers member_count over the sender-derived roster', () => {
    // A 5,000-member channel where three people post: the roster says 3, which
    // would score it as a small group — more personal than a family chat.
    const window = [msg({ content: 'someone should own the migration doc' })];
    const big = scoreRelevance(input({ window, evidence: window, memberCount: 5000 })).signals;
    expect(big.find((s) => s.id === 'broadcast')?.hit).toBe(true);
    expect(big.find((s) => s.id === 'small_group')?.hit).toBe(false);
  });

  it('falls back to the roster when the bridge reports no member count', () => {
    const window = [msg({ content: 'someone should own this' })];
    const signals = scoreRelevance(input({ window, evidence: window, memberCount: null })).signals;
    expect(signals.find((s) => s.id === 'small_group')?.hit).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('example 2.7 — sensitivity changes the answer', () => {
  const window = [msg({ content: 'Someone needs to own the migration doc by Thursday.', senderName: 'Dana' })];
  const scenario = input({ window, evidence: window, memberCount: 12, llmOwner: 'unknown' });

  it.each([
    ['off', false],
    ['low', false],
    ['normal', false],
    ['high', true],
  ] as const)('sensitivity=%s surfaces=%s', (sensitivity, expected) => {
    expect(decideRelevance(scenario, sensitivity).surfaced).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
describe('thresholds', () => {
  it('orders from strictest to loosest', () => {
    expect(relevanceThreshold('off')).toBe(Number.POSITIVE_INFINITY);
    expect(relevanceThreshold('low')).toBeGreaterThan(relevanceThreshold('normal'));
    expect(relevanceThreshold('normal')).toBeGreaterThan(relevanceThreshold('high'));
  });

  it('puts a signal-free group message below normal, but within reach of high', () => {
    // `high` deliberately admits ambient traffic — that is what "watch this
    // conversation closely" means. `normal` and `low` must not.
    const window = [msg({ content: 'the weather is nice today' })];
    const score = scoreRelevance(input({ window, evidence: window, memberCount: 12 })).score;
    expect(score).toBeLessThan(relevanceThreshold('normal'));
    expect(score).toBeGreaterThanOrEqual(relevanceThreshold('high'));
  });

  it('rounds scores so accumulated float error cannot drop one under its threshold', () => {
    // 0.35 - 0.25 is 0.09999999999999998 in IEEE-754, which silently fails a
    // >= 0.1 comparison and suppresses a loop that should surface.
    const window = [msg({ content: 'the weather is nice today' })];
    const score = scoreRelevance(input({ window, evidence: window, memberCount: 12 })).score;
    expect(score).toBe(0.1);
    expect(decideRelevance(input({ window, evidence: window, memberCount: 12 }), 'high').surfaced).toBe(true);
  });

  it('never returns a score outside 0..1', () => {
    const piled = [msg({ content: 'x' })];
    const negative = scoreRelevance(input({
      window: piled,
      evidence: piled,
      memberCount: 5000,
      llmOwner: 'them',
      llmOwnerName: 'Sam',
      platform: 'slack',
    }));
    expect(negative.score).toBeGreaterThanOrEqual(0);
    expect(negative.score).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
describe('explainability', () => {
  it('returns every signal it evaluated, hit or not', () => {
    const result = scoreRelevance(input());
    const ids = result.signals.map((s) => s.id);
    expect(ids).toContain('mention_exact');
    expect(ids).toContain('named_other');
    expect(ids).toContain('no_self_signal');
  });

  it('gives a human-readable reason for a surfaced loop', () => {
    const window = [msg({ content: '@Luc can you send that?' })];
    const result = scoreRelevance(input({ window, evidence: window }));
    expect(result.reasons.join(' ')).toMatch(/name appears|mentioned/i);
  });

  it('names the dominant suppressor rather than a generic failure', () => {
    const window = [msg({ content: '@channel heads up' })];
    const decision = decideRelevance(
      input({ platform: 'slack', window, evidence: window, memberCount: 60 }),
      'normal',
    );
    // broadcast_mention (-0.35) outweighs broadcast (-0.30) and
    // no_self_signal (-0.25), so it is the reason worth reporting.
    expect(decision.suppressedReason).toBe('broadcast_mention');
  });

  it('picks named_other when the work is explicitly someone else\'s', () => {
    const window = [msg({ content: 'Sam, can you pick up the cake?' })];
    const decision = decideRelevance(
      input({ window, evidence: window, memberCount: 6, llmOwner: 'them', llmOwnerName: 'Sam' }),
      'normal',
    );
    expect(decision.suppressedReason).toBe('named_other');
  });
});
