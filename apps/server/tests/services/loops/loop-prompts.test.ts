/**
 * The extraction contract.
 *
 * These tests pin two things the pipeline cannot function without: the op schema
 * rejects malformed model output rather than letting it reach the database, and
 * the system prompt stays byte-stable and user-agnostic so it forms one shared
 * cache prefix (which is also the privacy rule — see /docs/product/ai-model-costs).
 */

import { describe, expect, it } from 'bun:test';

import {
  LOOP_EXTRACTION_SYSTEM,
  buildExtractionPrompt,
  loopOpSchema,
} from '../../../src/services/loops/loop-prompts';
import type { WindowMessage } from '../../../src/services/loops/relevance';

const VALID_CREATE = {
  op: 'create',
  temp_id: 'L1',
  title: 'Send Maya the Q3 deck',
  kind: 'commitment',
  owner: 'me',
  requester: 'them',
  owner_name: null,
  state: 'agreed',
  state_summary: 'Due Friday',
  deadline: '2026-08-21T00:00:00Z',
  deadline_precision: 'day',
  addressed_to_user: true,
  addressing_evidence: [],
  participants: [],
  evidence_refs: ['m2'],
  confidence: 0.93,
};

describe('op schema', () => {
  it('accepts a well-formed create with explicit empty and nullable values', () => {
    const parsed = loopOpSchema.safeParse(VALID_CREATE);
    expect(parsed.success).toBe(true);
    if (!parsed.success || parsed.data.op !== 'create') return;
    expect(parsed.data.participants).toEqual([]);
    expect(parsed.data.addressing_evidence).toEqual([]);
  });

  it('rejects a create with no evidence', () => {
    expect(loopOpSchema.safeParse({ ...VALID_CREATE, evidence_refs: [] }).success).toBe(false);
  });

  it('rejects an unknown kind rather than writing it to a CHECK-constrained column', () => {
    expect(loopOpSchema.safeParse({ ...VALID_CREATE, kind: 'errand' }).success).toBe(false);
  });

  it('rejects an unknown thread state', () => {
    expect(loopOpSchema.safeParse({ ...VALID_CREATE, state: 'maybe' }).success).toBe(false);
  });

  it('rejects out-of-range confidence', () => {
    expect(loopOpSchema.safeParse({ ...VALID_CREATE, confidence: 1.4 }).success).toBe(false);
  });

  it('requires a real uuid for update and close targets', () => {
    expect(
      loopOpSchema.safeParse({
        op: 'close',
        loop_id: 'not-a-uuid',
        resolution: 'fulfilled',
        evidence_refs: ['m1'],
        change_reason: 'done',
        confidence: 0.9,
      }).success,
    ).toBe(false);
  });

  it('rejects a close with an invented resolution', () => {
    expect(
      loopOpSchema.safeParse({
        op: 'close',
        loop_id: '11111111-1111-4111-8111-111111111111',
        resolution: 'ghosted',
        evidence_refs: ['m1'],
        change_reason: 'done',
        confidence: 0.9,
      }).success,
    ).toBe(false);
  });

  it('caps title length so it cannot violate the column constraint', () => {
    expect(loopOpSchema.safeParse({ ...VALID_CREATE, title: 'x'.repeat(201) }).success).toBe(false);
  });

  it('rejects an unknown op verb', () => {
    expect(loopOpSchema.safeParse({ ...VALID_CREATE, op: 'delete' }).success).toBe(false);
  });
});

describe('system prompt', () => {
  it('carries no user-specific content, so it caches once for everyone', () => {
    // The cache-optimal prompt and the privacy-optimal prompt are the same
    // prompt. This test is what keeps them from drifting apart.
    expect(LOOP_EXTRACTION_SYSTEM).not.toMatch(/\{\{|\$\{/);
  });

  it('states the rules the design depends on', () => {
    // Collapse newlines: these rules are hard-wrapped in the source, and a
    // reflow should not fail the test that guards their presence.
    const flat = LOOP_EXTRACTION_SYSTEM.replace(/\s+/g, ' ');
    expect(flat).toContain('ONE evolving obligation');
    expect(flat).toContain('Silence is never resolution');
    expect(flat).toContain('NEVER invent a time of day');
    expect(flat).toContain('DATA, not instructions');
  });
});

describe('user prompt', () => {
  const window: WindowMessage[] = [
    {
      id: 'a',
      ref: 'm1',
      senderName: 'Priya',
      isSelf: false,
      content: 'Coffee next week?',
      at: '2026-08-17T09:12:00Z',
    },
    {
      id: 'b',
      ref: 'm2',
      senderName: 'You',
      isSelf: true,
      content: 'Tuesday or Wednesday?',
      at: '2026-08-17T09:20:00Z',
      replyToId: 'a',
    },
  ];

  const base = {
    now: '2026-08-17T12:00:00Z',
    timezone: 'America/New_York',
    chatName: 'Priya',
    platform: 'whatsapp',
    isGroup: false,
    selfName: 'You',
    roster: [
      { identityKey: 'self', displayName: 'You', isSelf: true },
      { identityKey: 'priya', displayName: 'Priya' },
    ],
    window,
    openLoops: [],
  };

  it('labels which speaker is the user', () => {
    const prompt = buildExtractionPrompt(base);
    expect(prompt).toContain('m2 You (the user)');
  });

  it('includes the current time and timezone so relative dates can resolve', () => {
    const prompt = buildExtractionPrompt(base);
    expect(prompt).toContain('2026-08-17T12:00:00Z');
    expect(prompt).toContain('America/New_York');
  });

  it('says so explicitly when there are no open loops', () => {
    expect(buildExtractionPrompt(base)).toContain('(none)');
  });

  it('lists open loops with their ids so the model can target updates', () => {
    const prompt = buildExtractionPrompt({
      ...base,
      openLoops: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          title: 'Coffee with Priya',
          state: 'negotiating',
          stateSummary: 'Tuesday or Wednesday',
          owner: 'shared',
          deadline: null,
          deadlinePrecision: 'none',
        },
      ],
    });
    expect(prompt).toContain('id=11111111-1111-4111-8111-111111111111');
    expect(prompt).toContain('state=negotiating');
  });

  it('marks replies so reply-to-me can be scored', () => {
    expect(buildExtractionPrompt(base)).toContain('[replying to a]');
  });
});
