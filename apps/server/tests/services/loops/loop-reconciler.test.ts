/**
 * The guards that stand between "Claire noticed something" and "Claire was
 * wrong in a way that cost a real commitment".
 *
 * The asymmetry is the point: a missed loop disappoints, a wrongly-closed loop
 * is a broken promise. Closes are therefore guarded hardest, and these tests
 * exist to keep that true.
 */

import { describe, expect, it } from 'bun:test';

import {
  AUTO_CLOSE_MIN_CONFIDENCE,
  computeDedupeKey,
  decideClose,
  decideCreate,
  decideUpdate,
  isActionable,
  planOps,
  resolveEvidence,
  type ReconcileContext,
} from '../../../src/services/loops/loop-reconciler';
import type { LoopCreateOp, LoopCloseOp, LoopUpdateOp } from '../../../src/services/loops/loop-prompts';
import type { SelfIdentity, WindowMessage } from '../../../src/services/loops/relevance';

const SELF: SelfIdentity = {
  userId: 'u1',
  displayNames: ['luc', 'lucsucces'],
  handles: ['luc'],
  phones: ['166100494'],
  contactIds: ['15166100494'],
};

function msg(ref: string, content: string, overrides: Partial<WindowMessage> = {}): WindowMessage {
  return {
    id: `id-${ref}`,
    ref,
    senderName: overrides.senderName ?? 'Priya',
    isSelf: overrides.isSelf ?? false,
    content,
    at: overrides.at ?? '2026-08-17T10:00:00Z',
    ...overrides,
  };
}

const WINDOW: WindowMessage[] = [
  msg('m1', 'We should catch up — coffee next week?'),
  msg('m2', 'Yes! Tuesday or Wednesday?', { isSelf: true, senderName: 'You' }),
  msg('m3', 'Wednesday works. 3pm?'),
];

function context(overrides: Partial<ReconcileContext> = {}): ReconcileContext {
  return {
    platform: 'whatsapp',
    isGroup: false,
    memberCount: 2,
    self: SELF,
    window: WINDOW,
    roster: [
      { identityKey: 'self', displayName: 'You', isSelf: true },
      { identityKey: 'priya', displayName: 'Priya' },
    ],
    watchTerms: [],
    settings: { sensitivity: 'normal', minConfidence: null, autoClose: true },
    liveLoopIds: new Set(['11111111-1111-4111-8111-111111111111']),
    ...overrides,
  };
}

function createOp(overrides: Partial<LoopCreateOp> = {}): LoopCreateOp {
  return {
    op: 'create',
    temp_id: 'L1',
    title: 'Coffee with Priya',
    kind: 'plan',
    owner: 'shared',
    owner_name: null,
    state: 'agreed',
    state_summary: 'Wednesday at 3pm',
    deadline: '2026-08-19T15:00:00Z',
    deadline_precision: 'exact',
    addressed_to_user: true,
    addressing_evidence: [],
    participants: ['Priya'],
    evidence_refs: ['m1', 'm3'],
    confidence: 0.9,
    ...overrides,
  };
}

const LIVE_ID = '11111111-1111-4111-8111-111111111111';

function updateOp(overrides: Partial<LoopUpdateOp> = {}): LoopUpdateOp {
  return {
    op: 'update',
    loop_id: LIVE_ID,
    state: 'agreed',
    state_summary: 'Moved to 3:15',
    status: null,
    owner: null,
    deadline: null,
    deadline_precision: null,
    evidence_refs: ['m3'],
    change_reason: 'Priya is running late',
    confidence: 0.8,
    ...overrides,
  };
}

function closeOp(overrides: Partial<LoopCloseOp> = {}): LoopCloseOp {
  return {
    op: 'close',
    loop_id: LIVE_ID,
    resolution: 'fulfilled',
    evidence_refs: ['m3'],
    change_reason: 'They met',
    confidence: 0.9,
    ...overrides,
  };
}

describe('dedupe key', () => {
  it('collides for the same intent phrased differently', () => {
    expect(computeDedupeKey('Send Maya the deck', ['Maya'])).toBe(
      computeDedupeKey('Send the deck to Maya!', ['Maya']),
    );
  });

  it('separates different intents with the same people', () => {
    expect(computeDedupeKey('Send Maya the deck', ['Maya'])).not.toBe(
      computeDedupeKey('Call Maya about the budget', ['Maya']),
    );
  });

  it('separates the same intent with different people', () => {
    expect(computeDedupeKey('Send the deck', ['Maya'])).not.toBe(
      computeDedupeKey('Send the deck', ['Alex']),
    );
  });
});

describe('create guards', () => {
  it('creates a surfaced loop for a confident DM commitment', () => {
    const outcome = decideCreate(createOp(), context());
    expect(outcome.action).toBe('create');
    if (outcome.action !== 'create') return;
    expect(outcome.visibility).toBe('surfaced');
  });

  it('skips a low-confidence create', () => {
    const outcome = decideCreate(createOp({ confidence: 0.2 }), context());
    expect(outcome).toEqual({ action: 'skip', reason: 'low_confidence' });
  });

  it('honours a per-chat confidence floor above the default', () => {
    const outcome = decideCreate(
      createOp({ confidence: 0.6 }),
      context({ settings: { sensitivity: 'normal', minConfidence: 0.8, autoClose: true } }),
    );
    expect(outcome).toEqual({ action: 'skip', reason: 'low_confidence' });
  });

  it('suppresses rather than discards a group loop that is someone else\'s', () => {
    const outcome = decideCreate(
      createOp({ owner: 'them', owner_name: 'Priya', addressed_to_user: false }),
      context({ isGroup: true, memberCount: 6 }),
    );
    expect(outcome.action).toBe('create');
    if (outcome.action !== 'create') return;
    // Written, never shown: the eval needs it and raising sensitivity can
    // retroactively surface it.
    expect(outcome.visibility).toBe('suppressed');
    expect(outcome.relevance.suppressedReason).toBe('named_other');
  });

  it('marks a loop owed by the other side as waiting', () => {
    const outcome = decideCreate(createOp({ owner: 'them' }), context());
    expect(outcome.action).toBe('create');
    if (outcome.action !== 'create') return;
    expect(outcome.status).toBe('waiting');
  });

  it('suppresses everything when the chat is off, even a DM commitment', () => {
    const outcome = decideCreate(
      createOp({ owner: 'me' }),
      context({ settings: { sensitivity: 'off', minConfidence: null, autoClose: true } }),
    );
    expect(outcome.action).toBe('create');
    if (outcome.action !== 'create') return;
    expect(outcome.visibility).toBe('suppressed');
    expect(outcome.relevance.suppressedReason).toBe('sensitivity_off');
  });
});

describe('update guards', () => {
  it('applies a confident update to a live loop', () => {
    expect(decideUpdate(updateOp(), context())).toEqual({ action: 'update' });
  });

  it('refuses to update a loop that is not live in this chat', () => {
    const outcome = decideUpdate(updateOp({ loop_id: '22222222-2222-4222-8222-222222222222' }), context());
    expect(outcome).toEqual({ action: 'skip', reason: 'unknown_loop' });
  });
});

describe('close guards — the strictest path in the pipeline', () => {
  it('closes on confident, evidenced resolution', () => {
    expect(decideClose(closeOp(), context())).toEqual({ action: 'close' });
  });

  it('never closes without evidence — silence is not resolution', () => {
    const outcome = decideClose(closeOp({ evidence_refs: ['m99'] }), context());
    expect(outcome).toEqual({ action: 'skip', reason: 'no_evidence' });
  });

  it('downgrades a low-confidence close to a suggestion', () => {
    const outcome = decideClose(
      closeOp({ confidence: AUTO_CLOSE_MIN_CONFIDENCE - 0.01 }),
      context(),
    );
    expect(outcome).toEqual({ action: 'suggest_close', reason: 'low_confidence' });
  });

  it('downgrades every close when the chat disables auto-close', () => {
    const outcome = decideClose(
      closeOp({ confidence: 1 }),
      context({ settings: { sensitivity: 'normal', minConfidence: null, autoClose: false } }),
    );
    expect(outcome).toEqual({ action: 'suggest_close', reason: 'auto_close_disabled' });
  });

  it('refuses to close a loop it cannot see', () => {
    const outcome = decideClose(closeOp({ loop_id: '33333333-3333-4333-8333-333333333333' }), context());
    expect(outcome).toEqual({ action: 'skip', reason: 'unknown_loop' });
  });
});

describe('actionability', () => {
  it.each([
    ['proposed', false],
    ['negotiating', false],
    ['pending_confirmation', false],
    ['agreed', true],
    ['resolved', true],
  ])('%s is actionable=%s', (state, expected) => {
    expect(isActionable(state)).toBe(expected);
  });
});

describe('planning a whole ops list', () => {
  it('drops a second create for the same intent', () => {
    // The prompt forbids this, but the guard cannot rely on the model obeying.
    const plan = planOps(
      [
        createOp({ temp_id: 'L1', title: 'Send Maya the deck', participants: ['Maya'] }),
        createOp({ temp_id: 'L2', title: 'Send the deck to Maya', participants: ['Maya'] }),
      ],
      context(),
    );
    const created = plan.creates.filter((c) => c.outcome.action === 'create');
    expect(created).toHaveLength(1);
  });

  it('routes each op kind to its own bucket', () => {
    const plan = planOps([createOp(), updateOp(), closeOp()], context());
    expect(plan.creates).toHaveLength(1);
    expect(plan.updates).toHaveLength(1);
    expect(plan.closes).toHaveLength(1);
  });
});

describe('evidence resolution', () => {
  it('maps refs back to messages and drops refs that are not in the window', () => {
    expect(resolveEvidence(['m1', 'm99', 'm3'], WINDOW).map((m) => m.ref)).toEqual(['m1', 'm3']);
  });
});
