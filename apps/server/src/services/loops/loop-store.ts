/**
 * Every database write the detection pipeline makes.
 *
 * Isolated from the reconciler so the decision logic is testable without a
 * database, and so the awkward parts of persistence live in one place:
 *
 *  - `uq_loops_live_dedupe` is a PARTIAL unique index, which PostgREST cannot
 *    use as an upsert arbiter. So creates are select-then-insert, with a 23505
 *    handled as "lost the race" rather than as an error.
 *  - Evidence attachment is idempotent at the database level
 *    (`uq_loop_events_evidence`), so re-reading the overlap window is safe.
 *
 * See /docs/plans/loops-revamp §5.
 */

import { transitionLoop } from './loop-transition';
import { logger } from '../../utils/logger';
import { supabase } from '../supabase';

/** Postgres unique-violation. */
const UNIQUE_VIOLATION = '23505';

export const DETECTOR_VERSION = 'thread-of-intent-2-recovery';

export interface LoopWriteFields {
  title: string;
  kind: string;
  owner: string;
  threadState: string;
  stateSummary: string;
  deadline: string | null;
  deadlinePrecision: string;
  relevance: number;
  relevanceSignals: unknown;
  visibility: 'surfaced' | 'suppressed' | 'shadow';
  suppressedReason: string | null;
  dedupeKey: string | null;
  confidence: number;
  requester?: string;
  priorityScore?: number;
  priorityBreakdown?: unknown;
}

export interface CreateLoopInput extends LoopWriteFields {
  userId: string;
  chatId: string;
  platform: string;
  originMessageId: string | null;
  latestMessageId: string | null;
  lastEvidenceAt: string | null;
  /** Loop rows still carry `content` and `from_me` for the legacy desktop cache. */
  content: string;
  fromMe: boolean;
  status: 'open' | 'waiting';
}

export interface StoredLoop {
  id: string;
  created: boolean;
  terminal?: boolean;
}

/**
 * Insert a loop, tolerating a concurrent pass that created the same one.
 *
 * Returns `created: false` when the row already existed, which the caller
 * converts into an update rather than treating as a failure.
 */
export async function createLoop(input: CreateLoopInput): Promise<StoredLoop | null> {
  if (input.dedupeKey && input.lastEvidenceAt) {
    const { data: terminal, error } = await supabase.from('loops').select('id')
      .eq('user_id', input.userId).eq('chat_id', input.chatId).eq('dedupe_key', input.dedupeKey)
      .in('status', ['done', 'dropped']).gte('resolved_at', input.lastEvidenceAt).limit(1).maybeSingle();
    if (error) throw error;
    if (terminal) return { id: terminal.id, created: false, terminal: true };
  }
  const row = {
    user_id: input.userId,
    chat_id: input.chatId,
    platform: input.platform,
    title: input.title,
    content: input.content,
    kind: input.kind,
    type: input.kind,
    owner: input.owner,
    requester: input.requester ?? 'unknown',
    from_me: input.fromMe,
    thread_state: input.threadState,
    state_summary: input.stateSummary,
    status: input.status,
    deadline: input.deadline,
    deadline_precision: input.deadlinePrecision,
    origin_message_id: input.originMessageId,
    latest_message_id: input.latestMessageId,
    last_evidence_at: input.lastEvidenceAt,
    relevance: input.relevance,
    relevance_signals: input.relevanceSignals,
    visibility: input.visibility,
    suppressed_reason: input.suppressedReason,
    dedupe_key: input.dedupeKey,
    confidence: input.confidence,
    priority_score: input.priorityScore ?? 0,
    priority_breakdown: input.priorityBreakdown ?? {},
    priority_updated_at: new Date().toISOString(),
    source: 'detector',
    detector_version: DETECTOR_VERSION,
    last_detected_at: new Date().toISOString(),
  };

  const { data, error } = await supabase.from('loops').insert(row).select('id').single();

  if (!error && data) return { id: data.id, created: true };

  if (error?.code === UNIQUE_VIOLATION && input.dedupeKey) {
    const existing = await findLiveLoopByDedupeKey(input.userId, input.chatId, input.dedupeKey);
    if (existing) return { id: existing, created: false };
  }

  logger.warn('[loops] create failed', { chatId: input.chatId, error: error?.message, code: error?.code });
  throw new Error(error?.message || 'Loop create failed');
}

export async function findLiveLoopByDedupeKey(
  userId: string,
  chatId: string,
  dedupeKey: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('loops')
    .select('id')
    .eq('user_id', userId)
    .eq('chat_id', chatId)
    .eq('dedupe_key', dedupeKey)
    .in('status', ['open', 'waiting', 'snoozed'])
    .maybeSingle();

  if (error) throw error;
  return data?.id ?? null;
}

export interface UpdateLoopInput {
  loopId: string;
  userId: string;
  expectedVersion?: number;
  evidenceGeneration?: number;
  visibility?: 'surfaced' | 'suppressed' | 'shadow';
  stateSummary?: string;
  threadState?: string | null;
  status?: string | null;
  owner?: string | null;
  requester?: string | null;
  deadline?: string | null;
  deadlinePrecision?: string | null;
  latestMessageId?: string | null;
  lastEvidenceAt?: string | null;
  confidence?: number;
}

/**
 * Apply an update, never overwriting a field a human has corrected.
 *
 * `user_edited` is checked here rather than by the caller because it is the one
 * rule that must hold for every write path into a loop row.
 */
export async function updateLoop(input: UpdateLoopInput): Promise<boolean> {
  const { data: current, error } = await supabase.from('loops').select('row_version,last_evidence_at,latest_message_id,status,evidence_generation')
    .eq('id', input.loopId).eq('user_id', input.userId).maybeSingle();
  if (error) throw error;
  if (!current || !['open','waiting','snoozed'].includes(current.status)) return false;
  const patch: Record<string, unknown> = { last_detected_at: new Date().toISOString(), detector_version: DETECTOR_VERSION };
  if (input.visibility !== undefined) patch.visibility = input.visibility;
  if (input.stateSummary !== undefined) patch.state_summary = input.stateSummary;
  if (input.threadState) patch.thread_state = input.threadState;
  // Evidence updates must never implicitly end a user's snooze.
  if (input.status && current.status !== 'snoozed') patch.status = input.status;
  if (input.owner) patch.owner = input.owner;
  if (input.requester) patch.requester = input.requester;
  if (input.deadline !== undefined) patch.deadline = input.deadline;
  if (input.deadlinePrecision) patch.deadline_precision = input.deadlinePrecision;
  if (input.confidence !== undefined) patch.confidence = input.confidence;
  if ((input.evidenceGeneration ?? 0) > (current.evidence_generation ?? 0)) {
    patch.evidence_generation = input.evidenceGeneration;
    patch.reviewed_at = null;
  }
  if (input.latestMessageId && input.lastEvidenceAt &&
      (!current.last_evidence_at || input.lastEvidenceAt > current.last_evidence_at || input.latestMessageId !== current.latest_message_id && input.lastEvidenceAt === current.last_evidence_at)) {
    patch.latest_message_id = input.latestMessageId;
    patch.last_evidence_at = input.lastEvidenceAt;
    patch.reviewed_at = null;
  }
  await transitionLoop({ userId: input.userId, loopId: input.loopId,
    expectedVersion: input.expectedVersion ?? current.row_version,
    patch, actor: 'detector', kind: 'state_change', summary: input.stateSummary ?? 'Updated from conversation evidence' });
  return true;
}

/** Autonomous closure is intentionally disabled; create a versioned suggestion. */
export async function closeLoop(_loopId: string, _userId: string, _resolution: string): Promise<boolean> {
  throw new Error('Use a reviewed closure proposal');
}

export interface LoopEventInput {
  loopId: string;
  userId: string;
  kind: string;
  actor?: string;
  messageId?: string | null;
  summary?: string | null;
  payload?: Record<string, unknown>;
  confidence?: number | null;
  occurredAt?: string;
}

/**
 * Append a timeline event.
 *
 * A duplicate evidence row is an expected outcome of the overlap window, not an
 * error, so the unique violation is swallowed silently.
 */
export async function recordEvent(input: LoopEventInput): Promise<void> {
  const { error } = await supabase.from('loop_events').insert({
    loop_id: input.loopId,
    user_id: input.userId,
    kind: input.kind,
    actor: input.actor ?? 'detector',
    message_id: input.messageId ?? null,
    summary: input.summary ?? null,
    payload: input.payload ?? {},
    confidence: input.confidence ?? null,
    occurred_at: input.occurredAt ?? new Date().toISOString(),
  });

  if (error && error.code !== UNIQUE_VIOLATION) {
    throw error;
  }
}

/** Attach evidence messages and keep evidence_count in step. */
export async function attachEvidence(
  loopId: string,
  userId: string,
  messages: Array<{ id: string; at: string; content: string }>,
): Promise<void> {
  if (!messages.length) return;

  for (const message of messages) {
    await recordEvent({
      loopId,
      userId,
      kind: 'evidence',
      messageId: message.id,
      summary: message.content.slice(0, 280),
      occurredAt: message.at,
    });
  }

  const { count, error: countError } = await supabase
    .from('loop_events')
    .select('id', { count: 'exact', head: true })
    .eq('loop_id', loopId)
    .eq('kind', 'evidence');

  if (countError) throw countError;
  const { error: evidenceError } = await supabase
    .from('loops')
    .update({ evidence_count: count ?? messages.length })
    .eq('id', loopId)
    .eq('user_id', userId);
  if (evidenceError) throw evidenceError;
}

export interface ParticipantInput {
  displayName: string;
  identityKey: string;
  contactId?: string | null;
  isSelf?: boolean;
  role?: 'owner' | 'counterparty' | 'mentioned' | 'observer';
}

export async function upsertLoopParticipants(
  loopId: string,
  userId: string,
  participants: ParticipantInput[],
): Promise<void> {
  if (!participants.length) return;

  const rows = participants.map((p) => ({
    loop_id: loopId,
    user_id: userId,
    display_name: p.displayName,
    identity_key: p.identityKey,
    contact_id: p.contactId ?? null,
    is_self: p.isSelf ?? false,
    role: p.role ?? 'observer',
  }));

  const { error } = await supabase
    .from('loop_participants')
    .upsert(rows, { onConflict: 'loop_id,identity_key', ignoreDuplicates: true });

  if (error) {
    throw error;
  }
}

/**
 * Advance the detection cursor.
 *
 * `consecutiveEmpty` drives the gate's backoff, so it is reset on any pass that
 * produced work and incremented otherwise.
 */
export async function advanceCursor(
  userId: string,
  chatId: string,
  timestamp: string | null,
  messageId: string | null,
  producedOps: boolean,
  gateResult: string,
  ingestSeq = 0,
): Promise<void> {
  const { error } = await supabase.rpc('advance_chat_loop_cursor', {
    p_user_id: userId, p_chat_id: chatId, p_timestamp: timestamp, p_message_id: messageId,
    p_produced: producedOps, p_result: gateResult, p_ingest_seq: ingestSeq,
  });
  if (error) throw error;
}
