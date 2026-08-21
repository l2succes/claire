/**
 * One detection pass over one chat.
 *
 * gate (free) -> extract+reconcile (one paid call) -> apply -> advance cursor.
 *
 * Extraction and reconciliation share a call because they share a transcript:
 * splitting them doubles cost and lets the two stages disagree about what a
 * message meant. The relevance decision is NOT in that call — it stays
 * deterministic in relevance.ts, so it costs nothing, is auditable, and does not
 * change when the model provider does.
 *
 * See /docs/plans/loops-revamp §5.
 */

import { logger } from '../../utils/logger';
import { NoProviderError, callStructuredList } from '../ai/structured';
import { buildLoopContext, type LoopContext } from './loop-context';
import { evaluateGate, type GateDecision } from './loop-gate';
import {
  LOOP_EXTRACTION_SYSTEM,
  buildExtractionPrompt,
  loopOpSchema,
  type LoopOp,
} from './loop-prompts';
import {
  planOps,
  resolveEvidence,
  isActionable,
  type ReconcileContext,
} from './loop-reconciler';
import {
  advanceCursor,
  attachEvidence,
  closeLoop,
  createLoop,
  recordEvent,
  updateLoop,
  upsertLoopParticipants,
} from './loop-store';
import { resolveSelfIdentity, isWeakIdentity } from './identity';

export type DetectionMode = 'queue' | 'inline' | 'off';

export function detectionMode(): DetectionMode {
  const raw = (process.env.LOOP_DETECTION_MODE || 'off').toLowerCase();
  if (raw === 'queue' || raw === 'inline') return raw;
  return 'off';
}

export interface DetectionResult {
  ran: boolean;
  skipReason: string | null;
  gate: GateDecision | null;
  created: number;
  updated: number;
  closed: number;
  suppressed: number;
  suggestedCloses: number;
  inputTokens: number;
  outputTokens: number;
  provider: string | null;
}

export interface DetectionRunOptions {
  /** A bounded historical slice selected by a backfill runner. */
  messageIds?: string[];
  /** Historical slices must not move the live cursor until the scan finishes. */
  advanceCursor?: boolean;
}

const EMPTY_RESULT: DetectionResult = {
  ran: false,
  skipReason: null,
  gate: null,
  created: 0,
  updated: 0,
  closed: 0,
  suppressed: 0,
  suggestedCloses: 0,
  inputTokens: 0,
  outputTokens: 0,
  provider: null,
};

/**
 * Run detection for one chat.
 *
 * Never throws: a detection failure must not take down message ingestion. The
 * cursor is only advanced on a pass that actually completed, so a transient
 * model outage means the window is retried rather than skipped.
 */
export async function detectLoopsForChat(
  userId: string,
  chatId: string,
  options: DetectionRunOptions = {},
): Promise<DetectionResult> {
  if (detectionMode() === 'off') {
    return { ...EMPTY_RESULT, skipReason: 'detection_mode_off' };
  }

  let context: LoopContext | null;
  try {
    context = await buildLoopContext(userId, chatId, {
      messageIds: options.messageIds,
      treatWindowAsDelta: !!options.messageIds,
    });
  } catch (error) {
    logger.warn('[loops] context build failed', {
      chatId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { ...EMPTY_RESULT, skipReason: 'context_error' };
  }

  if (!context) return { ...EMPTY_RESULT, skipReason: 'no_context' };

  const gate = evaluateGate({
    platform: context.platform,
    sensitivity: context.settings.sensitivity,
    detectionEnabled: context.detectionEnabled,
    delta: context.delta,
    openLoopCount: context.openLoops.length,
    watchTerms: context.settings.watchTerms,
    consecutiveEmpty: context.consecutiveEmpty,
  });

  if (!gate.run) {
    // Still advance the cursor: these messages have been considered and must not
    // be re-read forever. `producedOps: false` feeds the backoff.
    if (options.advanceCursor !== false) {
      await advanceCursor(userId, chatId, context.cursorTimestamp, context.cursorMessageId, false, gate.skipReason ?? 'skip');
    }
    return { ...EMPTY_RESULT, gate, skipReason: gate.skipReason };
  }

  const self = await resolveSelfIdentity(userId, context.platform, context.accountRef);
  if (isWeakIdentity(self) && context.isGroup) {
    // With no aliases every group message looks unaddressed, so suppression
    // would be an artifact of missing data rather than a real judgement.
    logger.warn('[loops] weak self identity, skipping group detection', { userId, platform: context.platform });
    return { ...EMPTY_RESULT, gate, skipReason: 'weak_identity' };
  }

  let ops: LoopOp[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let provider: string | null = null;

  try {
    const response = await callStructuredList<LoopOp>({
      role: 'extraction',
      label: 'loop.extract',
      system: LOOP_EXTRACTION_SYSTEM,
      prompt: buildExtractionPrompt({
        now: new Date().toISOString(),
        timezone: context.timezone,
        chatName: context.chatName,
        platform: context.platform,
        isGroup: context.isGroup,
        selfName: 'You',
        roster: context.roster,
        window: context.window,
        openLoops: context.openLoops,
      }),
      itemSchema: loopOpSchema,
      listKey: 'ops',
      schemaName: 'loop_operations',
      schemaDescription: 'Operations that bring open loops in line with the transcript.',
    });

    ops = response.items;
    inputTokens = response.inputTokens;
    outputTokens = response.outputTokens;
    provider = response.provider;
  } catch (error) {
    if (error instanceof NoProviderError) {
      return { ...EMPTY_RESULT, gate, skipReason: 'no_ai_provider' };
    }
    logger.warn('[loops] extraction failed', {
      chatId,
      error: error instanceof Error ? error.message : String(error),
    });
    // Do NOT advance the cursor: retry this window on the next pass.
    return { ...EMPTY_RESULT, gate, skipReason: 'extraction_failed' };
  }

  const reconcileContext: ReconcileContext = {
    platform: context.platform,
    isGroup: context.isGroup,
    memberCount: context.memberCount,
    self,
    window: context.window,
    roster: context.roster,
    watchTerms: context.settings.watchTerms,
    settings: {
      sensitivity: context.settings.sensitivity,
      minConfidence: context.settings.minConfidence,
      autoClose: context.settings.autoClose,
    },
    liveLoopIds: new Set(context.openLoops.map((l) => l.id)),
  };

  const plan = planOps(ops, reconcileContext);
  const result: DetectionResult = {
    ...EMPTY_RESULT,
    ran: true,
    gate,
    inputTokens,
    outputTokens,
    provider,
  };

  for (const { op, outcome } of plan.creates) {
    if (outcome.action !== 'create') continue;

    const evidence = resolveEvidence(op.evidence_refs, context.window);
    const newest = evidence[evidence.length - 1];

    const stored = await createLoop({
      userId,
      chatId,
      platform: context.platform,
      title: op.title,
      content: op.state_summary || op.title,
      kind: op.kind,
      owner: op.owner,
      fromMe: op.owner === 'me',
      threadState: op.state,
      stateSummary: op.state_summary,
      status: outcome.status,
      deadline: normalizeDeadline(op.deadline),
      deadlinePrecision: op.deadline_precision,
      originMessageId: evidence[0]?.id ?? null,
      latestMessageId: newest?.id ?? null,
      lastEvidenceAt: newest?.at ?? null,
      relevance: outcome.relevance.score,
      relevanceSignals: {
        signals: outcome.relevance.signals,
        reasons: outcome.relevance.reasons,
        threshold: outcome.relevance.threshold,
        hardPass: outcome.relevance.hardPass,
        addressed: outcome.relevance.addressed,
      },
      visibility: outcome.visibility,
      suppressedReason: outcome.relevance.suppressedReason,
      dedupeKey: outcome.dedupeKey,
      confidence: op.confidence,
    });

    if (!stored) continue;

    if (stored.created) {
      await recordEvent({
        loopId: stored.id,
        userId,
        kind: outcome.visibility === 'suppressed' ? 'suppressed' : 'created',
        summary: op.state_summary || op.title,
        confidence: op.confidence,
        payload: {
          threadState: op.state,
          actionable: isActionable(op.state),
          relevance: outcome.relevance.score,
          suppressedReason: outcome.relevance.suppressedReason,
        },
      });

      await upsertLoopParticipants(
        stored.id,
        userId,
        buildParticipants(op.participants, context, op.owner, op.owner_name ?? null),
      );
    } else {
      // Lost a race, or the same intent restated: fold it into the live loop.
      await updateLoop({
        loopId: stored.id,
        userId,
        stateSummary: op.state_summary,
        threadState: op.state,
        latestMessageId: newest?.id ?? null,
        lastEvidenceAt: newest?.at ?? null,
        confidence: op.confidence,
      });
      await recordEvent({
        loopId: stored.id,
        userId,
        kind: 'merged',
        summary: 'Restated in the same conversation',
        confidence: op.confidence,
      });
    }

    await attachEvidence(stored.id, userId, evidence.map((m) => ({ id: m.id, at: m.at, content: m.content })));

    if (outcome.visibility === 'suppressed') result.suppressed += 1;
    else result.created += 1;
  }

  for (const { op, outcome } of plan.updates) {
    if (outcome.action !== 'update') continue;

    const evidence = resolveEvidence(op.evidence_refs, context.window);
    const newest = evidence[evidence.length - 1];

    const applied = await updateLoop({
      loopId: op.loop_id,
      userId,
      stateSummary: op.state_summary,
      threadState: op.state ?? null,
      status: op.status ?? null,
      owner: op.owner ?? null,
      deadline: op.deadline === undefined ? undefined : normalizeDeadline(op.deadline),
      deadlinePrecision: op.deadline_precision ?? null,
      latestMessageId: newest?.id ?? null,
      lastEvidenceAt: newest?.at ?? null,
      confidence: op.confidence,
    });

    if (!applied) continue;

    await recordEvent({
      loopId: op.loop_id,
      userId,
      kind: 'state_change',
      summary: op.change_reason,
      confidence: op.confidence,
      payload: { threadState: op.state, status: op.status },
    });

    if (evidence.length) {
      await attachEvidence(op.loop_id, userId, evidence.map((m) => ({ id: m.id, at: m.at, content: m.content })));
    }
    result.updated += 1;
  }

  for (const { op, outcome } of plan.closes) {
    if (outcome.action === 'skip') continue;

    if (outcome.action === 'suggest_close') {
      // Recorded but not applied: the details page surfaces this as a confirm
      // chip. A wrongly-closed loop is the worst failure this system has.
      await recordEvent({
        loopId: op.loop_id,
        userId,
        kind: 'agent_note',
        summary: `Claire thinks this is done: ${op.change_reason}`,
        confidence: op.confidence,
        payload: { suggestedResolution: op.resolution, reason: outcome.reason },
      });
      result.suggestedCloses += 1;
      continue;
    }

    const evidence = resolveEvidence(op.evidence_refs, context.window);
    if (await closeLoop(op.loop_id, userId, op.resolution)) {
      await recordEvent({
        loopId: op.loop_id,
        userId,
        kind: 'resolved',
        summary: op.change_reason,
        confidence: op.confidence,
        messageId: evidence[evidence.length - 1]?.id ?? null,
        payload: { resolution: op.resolution },
      });
      result.closed += 1;
    }
  }

  const producedOps = result.created + result.updated + result.closed + result.suppressed > 0;
  if (options.advanceCursor !== false) {
    await advanceCursor(userId, chatId, context.cursorTimestamp, context.cursorMessageId, producedOps, 'ran');
  }

  logger.info('[loops] detection pass', {
    chatId,
    provider,
    gateReasons: gate.reasons,
    ...pickCounts(result),
  });

  return result;
}

function pickCounts(result: DetectionResult) {
  return {
    created: result.created,
    updated: result.updated,
    closed: result.closed,
    suppressed: result.suppressed,
    suggestedCloses: result.suggestedCloses,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}

/**
 * Accept only a parseable date.
 *
 * The prompt forbids inventing a time of day, but a malformed string would
 * otherwise reach a TIMESTAMPTZ column and fail the whole write.
 */
function normalizeDeadline(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** Roster entries for the people a loop actually involves. */
export function buildParticipants(
  names: string[],
  context: LoopContext,
  owner: 'me' | 'them' | 'shared' | 'unknown',
  ownerName: string | null,
): Array<{ displayName: string; identityKey: string; contactId?: string | null; isSelf?: boolean; role?: 'owner' | 'counterparty' | 'mentioned' | 'observer' }> {
  const byName = new Map(context.roster.map((p) => [p.displayName.toLowerCase(), p]));

  return names.slice(0, 25).map((name) => {
    const match = byName.get(name.toLowerCase());
    const isSelf = match?.isSelf ?? false;
    // The model's optional name must never override the structured owner
    // direction. In particular, a user cannot be labelled the owner of a loop
    // whose `owner` is `them` merely because their name appeared in the prompt.
    const isOwner = owner === 'me'
      ? isSelf
      : owner === 'them' && !isSelf && !!ownerName && name.toLowerCase() === ownerName.toLowerCase();
    return {
      displayName: name,
      identityKey: match?.identityKey ?? name.toLowerCase(),
      contactId: match?.contactId ?? null,
      isSelf,
      role: isOwner ? ('owner' as const) : ('counterparty' as const),
    };
  });
}
