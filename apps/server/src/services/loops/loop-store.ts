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

import { logger } from '../../utils/logger';
import { supabase } from '../supabase';

/** Postgres unique-violation. */
const UNIQUE_VIOLATION = '23505';

export const DETECTOR_VERSION = 'thread-of-intent-1';

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
}

/**
 * Insert a loop, tolerating a concurrent pass that created the same one.
 *
 * Returns `created: false` when the row already existed, which the caller
 * converts into an update rather than treating as a failure.
 */
export async function createLoop(input: CreateLoopInput): Promise<StoredLoop | null> {
  const row = {
    user_id: input.userId,
    chat_id: input.chatId,
    platform: input.platform,
    title: input.title,
    content: input.content,
    kind: input.kind,
    type: input.kind,
    owner: input.owner,
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
  return null;
}

export async function findLiveLoopByDedupeKey(
  userId: string,
  chatId: string,
  dedupeKey: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('loops')
    .select('id')
    .eq('user_id', userId)
    .eq('chat_id', chatId)
    .eq('dedupe_key', dedupeKey)
    .in('status', ['open', 'waiting', 'snoozed'])
    .maybeSingle();

  return data?.id ?? null;
}

export interface UpdateLoopInput {
  loopId: string;
  userId: string;
  stateSummary?: string;
  threadState?: string | null;
  status?: string | null;
  owner?: string | null;
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
  const { data: current } = await supabase
    .from('loops')
    .select('user_edited, evidence_count')
    .eq('id', input.loopId)
    .eq('user_id', input.userId)
    .maybeSingle();

  if (!current) return false;

  const patch: Record<string, unknown> = {
    last_detected_at: new Date().toISOString(),
    detector_version: DETECTOR_VERSION,
  };

  if (input.stateSummary !== undefined) patch.state_summary = input.stateSummary;
  if (input.threadState) patch.thread_state = input.threadState;
  if (input.status) patch.status = input.status;
  if (input.latestMessageId) patch.latest_message_id = input.latestMessageId;
  if (input.lastEvidenceAt) patch.last_evidence_at = input.lastEvidenceAt;
  if (input.confidence !== undefined) patch.confidence = input.confidence;

  // A human correction outranks the detector on the fields a human can set.
  if (!current.user_edited) {
    if (input.owner) patch.owner = input.owner;
    if (input.deadline !== undefined) patch.deadline = input.deadline;
    if (input.deadlinePrecision) patch.deadline_precision = input.deadlinePrecision;
  }

  const { error } = await supabase
    .from('loops')
    .update(patch)
    .eq('id', input.loopId)
    .eq('user_id', input.userId);

  if (error) {
    logger.warn('[loops] update failed', { loopId: input.loopId, error: error.message });
    return false;
  }
  return true;
}

export async function closeLoop(
  loopId: string,
  userId: string,
  resolution: string,
): Promise<boolean> {
  const { error } = await supabase
    .from('loops')
    .update({
      status: 'done',
      thread_state: 'resolved',
      resolution,
      resolved_at: new Date().toISOString(),
      last_detected_at: new Date().toISOString(),
    })
    .eq('id', loopId)
    .eq('user_id', userId);

  if (error) {
    logger.warn('[loops] close failed', { loopId, error: error.message });
    return false;
  }
  return true;
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
    logger.warn('[loops] event insert failed', { loopId: input.loopId, kind: input.kind, error: error.message });
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

  const { count } = await supabase
    .from('loop_events')
    .select('id', { count: 'exact', head: true })
    .eq('loop_id', loopId)
    .eq('kind', 'evidence');

  await supabase
    .from('loops')
    .update({ evidence_count: count ?? messages.length })
    .eq('id', loopId)
    .eq('user_id', userId);
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
    logger.warn('[loops] participant upsert failed', { loopId, error: error.message });
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
): Promise<void> {
  const { data: current } = await supabase
    .from('chat_loop_cursors')
    .select('consecutive_empty')
    .eq('user_id', userId)
    .eq('chat_id', chatId)
    .maybeSingle();

  const consecutiveEmpty = producedOps ? 0 : (current?.consecutive_empty ?? 0) + 1;

  const { error } = await supabase.from('chat_loop_cursors').upsert(
    {
      user_id: userId,
      chat_id: chatId,
      last_message_timestamp: timestamp,
      last_message_id: messageId,
      last_run_at: new Date().toISOString(),
      last_gate_result: gateResult,
      consecutive_empty: consecutiveEmpty,
    },
    { onConflict: 'user_id,chat_id' },
  );

  if (error) {
    logger.warn('[loops] cursor advance failed', { chatId, error: error.message });
  }
}
