/**
 * Turn model operations into decisions.
 *
 * Split from loop-store deliberately: this file is pure, so every guard below
 * is table-testable without a database. The guards are the product — they are
 * what stands between "Claire noticed something" and "Claire was wrong in a way
 * that cost the user a real commitment".
 *
 * The asymmetry throughout is intentional. A missed loop is a disappointment;
 * a wrongly-closed loop is a broken promise. So closes are guarded hardest.
 *
 * See /docs/plans/loops-revamp §5.
 */

import { createHash } from 'crypto';

import type { LoopSensitivity } from '@claire/platform-catalog';

import { decideRelevance, type RelevanceDecision, type SelfIdentity, type WindowMessage, type ParticipantRef } from './relevance';
import type { LoopOp, LoopCreateOp, LoopUpdateOp, LoopCloseOp } from './loop-prompts';

/**
 * Confidence a close must clear before it is applied without asking.
 * Below this the close is recorded and surfaced as "Claire thinks this is
 * done" rather than applied.
 */
export const AUTO_CLOSE_MIN_CONFIDENCE = 0.75;

/** Default confidence a create must clear when a chat sets no explicit floor. */
export const DEFAULT_MIN_CONFIDENCE = 0.5;

export type CreateOutcome =
  | { action: 'create'; visibility: 'surfaced'; status: 'open' | 'waiting'; relevance: RelevanceDecision; dedupeKey: string }
  | { action: 'create'; visibility: 'suppressed'; status: 'open' | 'waiting'; relevance: RelevanceDecision; dedupeKey: string }
  | { action: 'skip'; reason: 'low_confidence' | 'not_actionable' };

export type UpdateOutcome =
  | { action: 'update' }
  | { action: 'skip'; reason: 'low_confidence' | 'unknown_loop' };

export type CloseOutcome =
  | { action: 'close' }
  | { action: 'suggest_close'; reason: 'low_confidence' | 'auto_close_disabled' }
  | { action: 'skip'; reason: 'unknown_loop' | 'no_evidence' };

export interface ReconcileSettings {
  sensitivity: LoopSensitivity;
  minConfidence: number | null;
  autoClose: boolean;
}

export interface ReconcileContext {
  platform: string;
  isGroup: boolean;
  memberCount: number | null;
  self: SelfIdentity;
  window: WindowMessage[];
  roster: ParticipantRef[];
  watchTerms: readonly string[];
  settings: ReconcileSettings;
  /** Ids of loops currently live in this chat, for validating update/close targets. */
  liveLoopIds: Set<string>;
}

/**
 * Stable key for "the same intent in the same conversation".
 *
 * Normalized hard — lowercased, punctuation and stopwords stripped, tokens
 * sorted — so "send Maya the deck" and "Send the deck to Maya!" collide. This
 * is the cheap dedupe layer; embedding similarity is the expensive one.
 */
export function computeDedupeKey(title: string, participants: string[]): string {
  const STOPWORDS = new Set([
    'the', 'a', 'an', 'to', 'for', 'of', 'and', 'with', 'on', 'at', 'by',
    'in', 'my', 'your', 'their', 'our', 'his', 'her', 'its',
  ]);

  const tokens = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token))
    .sort();

  const people = [...participants]
    .map((p) => p.toLowerCase().replace(/[^a-z0-9]/g, ''))
    .filter(Boolean)
    .sort();

  return createHash('sha1').update(`${tokens.join(' ')}|${people.join(',')}`).digest('hex').slice(0, 32);
}

/** Resolve evidence refs ("m4") back to real messages. */
export function resolveEvidence(refs: string[], window: WindowMessage[]): WindowMessage[] {
  const byRef = new Map(window.map((m) => [m.ref, m]));
  return refs.map((ref) => byRef.get(ref)).filter((m): m is WindowMessage => !!m);
}

/**
 * Only `agreed` and later are actionable.
 *
 * A loop that is merely proposed still gets stored — it is how "we should catch
 * up sometime" becomes a real plan three messages later — but it sits out of the
 * Open count and triggers no plugin. This is what keeps the list trustworthy.
 */
export function isActionable(threadState: string): boolean {
  return threadState === 'agreed' || threadState === 'resolved';
}

export function decideCreate(op: LoopCreateOp, context: ReconcileContext): CreateOutcome {
  const evidence = resolveEvidence(op.evidence_refs, context.window);
  const minConfidence = context.settings.minConfidence ?? DEFAULT_MIN_CONFIDENCE;

  if (op.confidence < minConfidence) {
    return { action: 'skip', reason: 'low_confidence' };
  }

  const relevance = decideRelevance(
    {
      platform: context.platform,
      isGroup: context.isGroup,
      memberCount: context.memberCount,
      self: context.self,
      window: context.window,
      evidence,
      roster: context.roster,
      watchTerms: context.watchTerms,
      llmOwner: op.owner,
      llmAddressed: op.addressed_to_user,
      llmOwnerName: op.owner_name ?? null,
    },
    context.settings.sensitivity,
  );

  const dedupeKey = computeDedupeKey(op.title, op.participants);

  // `waiting` means "someone else owes me this" — the filter the user reads as
  // "I'm waiting on them". Driven by owner, not by who sent the message.
  const status: 'open' | 'waiting' = op.owner === 'them' ? 'waiting' : 'open';

  // Suppressed loops are written, not discarded: it is the only way the eval can
  // measure the filter, and it lets raising a chat's sensitivity retroactively
  // surface what was ignored. LOOP_SUPPRESSED_RETENTION_DAYS=0 makes it a true
  // hard filter through the same code path.
  return {
    action: 'create',
    visibility: relevance.surfaced ? 'surfaced' : 'suppressed',
    status,
    relevance,
    dedupeKey,
  };
}

export function decideUpdate(op: LoopUpdateOp, context: ReconcileContext): UpdateOutcome {
  if (!context.liveLoopIds.has(op.loop_id)) {
    return { action: 'skip', reason: 'unknown_loop' };
  }
  // Updates carry a lower bar than creates: the loop already exists and was
  // already judged relevant, so the only question is whether the model is
  // confident this window moved it.
  if (op.confidence < 0.35) {
    return { action: 'skip', reason: 'low_confidence' };
  }
  return { action: 'update' };
}

export function decideClose(op: LoopCloseOp, context: ReconcileContext): CloseOutcome {
  if (!context.liveLoopIds.has(op.loop_id)) {
    return { action: 'skip', reason: 'unknown_loop' };
  }

  // "Silence is never resolution." A close with no citation is not a close.
  const evidence = resolveEvidence(op.evidence_refs, context.window);
  if (!evidence.length) {
    return { action: 'skip', reason: 'no_evidence' };
  }

  if (!context.settings.autoClose) {
    return { action: 'suggest_close', reason: 'auto_close_disabled' };
  }

  if (op.confidence < AUTO_CLOSE_MIN_CONFIDENCE) {
    return { action: 'suggest_close', reason: 'low_confidence' };
  }

  return { action: 'close' };
}

export interface OpsPlan {
  creates: Array<{ op: LoopCreateOp; outcome: CreateOutcome }>;
  updates: Array<{ op: LoopUpdateOp; outcome: UpdateOutcome }>;
  closes: Array<{ op: LoopCloseOp; outcome: CloseOutcome }>;
}

/**
 * Plan a whole ops list.
 *
 * Creates are de-duplicated against each other by dedupe key: the prompt tells
 * the model never to emit two creates for one intent, but the guard cannot rely
 * on the model obeying it.
 */
export function planOps(ops: LoopOp[], context: ReconcileContext): OpsPlan {
  const plan: OpsPlan = { creates: [], updates: [], closes: [] };
  const seenKeys = new Set<string>();

  for (const op of ops) {
    if (op.op === 'create') {
      const outcome = decideCreate(op, context);
      if (outcome.action === 'create') {
        if (seenKeys.has(outcome.dedupeKey)) continue;
        seenKeys.add(outcome.dedupeKey);
      }
      plan.creates.push({ op, outcome });
    } else if (op.op === 'update') {
      plan.updates.push({ op, outcome: decideUpdate(op, context) });
    } else {
      plan.closes.push({ op, outcome: decideClose(op, context) });
    }
  }

  return plan;
}
