/**
 * The gate is the cost lever, so its failure modes are asymmetric and worth
 * pinning: skipping a window that contained a commitment loses a loop forever,
 * while running one that contained nothing costs a fraction of a cent.
 */

import { describe, expect, it } from 'bun:test';

import { evaluateGate, type GateInput } from '../../../src/services/loops/loop-gate';
import type { WindowMessage } from '../../../src/services/loops/relevance';

function msg(content: string, overrides: Partial<WindowMessage> = {}): WindowMessage {
  return {
    id: overrides.id ?? `id-${content.slice(0, 8)}`,
    ref: overrides.ref ?? 'm1',
    senderName: overrides.senderName ?? 'Alex',
    isSelf: overrides.isSelf ?? false,
    content,
    at: overrides.at ?? '2026-08-17T10:00:00Z',
    ...overrides,
  };
}

function gate(overrides: Partial<GateInput> = {}) {
  return evaluateGate({
    platform: 'whatsapp',
    sensitivity: 'normal',
    detectionEnabled: true,
    delta: [],
    openLoopCount: 0,
    consecutiveEmpty: 0,
    ...overrides,
  });
}

describe('loop gate — hard skips', () => {
  it('never runs when the chat is set to off', () => {
    const result = gate({
      sensitivity: 'off',
      delta: [msg("I'll send it tomorrow")],
      openLoopCount: 3,
    });
    expect(result.run).toBe(false);
    expect(result.skipReason).toBe('sensitivity_off');
  });

  it('never runs when the user disabled detection', () => {
    const result = gate({ detectionEnabled: false, delta: [msg("I'll send it tomorrow")] });
    expect(result.run).toBe(false);
    expect(result.skipReason).toBe('detection_disabled');
  });

  it('skips a window too short to contain a commitment', () => {
    const result = gate({ delta: [msg('ok')] });
    expect(result.run).toBe(false);
    expect(result.skipReason).toBe('window_too_short');
  });

  it('skips ambient chatter with no intent signal', () => {
    const result = gate({
      delta: [msg('haha that is hilarious'), msg('right?? so good')],
    });
    expect(result.run).toBe(false);
    expect(result.skipReason).toBe('no_signal');
  });
});

describe('loop gate — signals that must fire', () => {
  it('runs on a first-person commitment', () => {
    const result = gate({ delta: [msg("I'll get you the deck by Friday", { isSelf: true })] });
    expect(result.run).toBe(true);
    expect(result.reasons).toContain('commissive');
    expect(result.reasons).toContain('self_commissive');
  });

  it('runs on a request', () => {
    const result = gate({ delta: [msg('Can you review the contract this week?')] });
    expect(result.run).toBe(true);
    expect(result.reasons).toContain('directive');
  });

  it('runs on planning language with no date at all', () => {
    // This is the "we should catch up" case that opens a loop at `proposed`.
    const result = gate({ delta: [msg('we should grab coffee sometime soon')] });
    expect(result.run).toBe(true);
    expect(result.reasons).toContain('planning');
  });

  it('runs on a watch term even with no other signal', () => {
    const result = gate({
      delta: [msg('the Q3 audit spreadsheet is looking rough')],
      watchTerms: ['Q3 audit'],
    });
    expect(result.run).toBe(true);
    expect(result.reasons).toContain('watch_term');
  });
});

describe('loop gate — resolution and open loops', () => {
  it('runs when a loop is open even with an empty delta', () => {
    // Without this the pipeline could open loops but never close them.
    const result = gate({ delta: [], openLoopCount: 2 });
    expect(result.run).toBe(true);
    expect(result.reasons).toContain('open_loops_present');
  });

  it('runs on bare resolution language when a loop is open', () => {
    const result = gate({ delta: [msg('sent!')], openLoopCount: 1 });
    expect(result.run).toBe(true);
  });
});

describe('loop gate — backoff', () => {
  it('requires more signal from a chat that keeps producing nothing', () => {
    // A date alone, and nothing else — exactly one signal.
    const oneSignal = { delta: [msg('the meeting is on Tuesday')], consecutiveEmpty: 6 };
    expect(gate(oneSignal).reasons).toEqual(['temporal']);
    expect(gate(oneSignal).run).toBe(false);
    expect(gate(oneSignal).skipReason).toBe('backoff');

    // The same window in a chat that has been productive still runs.
    expect(gate({ ...oneSignal, consecutiveEmpty: 0 }).run).toBe(true);
  });

  it('lets a two-signal window through the same backoff', () => {
    // "tomorrow" is temporal and "works" is resolution language, so this
    // clears the higher bar that one signal alone does not.
    const result = gate({ delta: [msg('maybe tomorrow works')], consecutiveEmpty: 6 });
    expect(result.reasons.length).toBeGreaterThanOrEqual(2);
    expect(result.run).toBe(true);
  });

  it('never backs off a commitment the user made themselves', () => {
    const result = gate({
      delta: [msg("I'll handle it", { isSelf: true })],
      consecutiveEmpty: 50,
    });
    expect(result.run).toBe(true);
  });

  it('never backs off a chat with open loops', () => {
    const result = gate({ delta: [msg('probably later')], consecutiveEmpty: 50, openLoopCount: 1 });
    expect(result.run).toBe(true);
  });
});

describe('loop gate — machine senders', () => {
  it('ignores bot senders when deciding there is nothing here', () => {
    const result = gate({
      delta: [msg('Your order ships Friday', { senderName: 'ShopBot' })],
    });
    expect(result.run).toBe(false);
    expect(result.skipReason).toBe('no_human_message');
  });

  it.each(['bot', 'Claire Bot', 'orders-bot', 'no-reply', 'ShopBot'])(
    'treats %s as a machine sender',
    (senderName) => {
      const result = gate({ delta: [msg('Your order ships Friday', { senderName })] });
      expect(result.skipReason).toBe('no_human_message');
    },
  );

  it.each(['Abbot', 'Talbot', 'Elliot Abbot'])(
    'does not mistake the surname %s for a bot',
    (senderName) => {
      // A person named Abbot must still be able to make commitments.
      const result = gate({ delta: [msg("I'll send the file on Friday", { senderName })] });
      expect(result.run).toBe(true);
    },
  );
});
