/**
 * Assemble everything one detection pass needs, in one place.
 *
 * Two decisions here carry real weight:
 *
 *  1. **Overlap.** The window starts a few messages *before* the cursor so a
 *     loop that spans the boundary stays coherent. Evidence attachment is
 *     idempotent at the database level (uq_loop_events_evidence), so re-reading
 *     those messages cannot duplicate anything.
 *  2. **Thread scoping.** On platforms with native threads, a flat window
 *     interleaves unrelated conversations and the extraction gets garbage. Where
 *     a thread root exists the window follows the thread instead of the channel.
 *
 * See /docs/plans/loops-revamp §5.
 */

import { loopSemanticsFor, type LoopSensitivity } from '@claire/platform-catalog';

import { logger } from '../../utils/logger';
import { supabase } from '../supabase';
import type { OpenLoopSummary } from './loop-prompts';
import { normalizeAlias, type ParticipantRef, type WindowMessage } from './relevance';

/** Messages of overlap re-read before the cursor. */
export const WINDOW_OVERLAP = 6;

/** Hard caps so one busy channel cannot blow the prompt budget. */
export const WINDOW_MAX_MESSAGES = 40;
export const WINDOW_MAX_CHARS = 6000;
const MAX_OPEN_LOOPS = 20;
const MAX_ROSTER = 25;

const LIVE_STATUSES = ['open', 'waiting', 'snoozed'] as const;

export interface ChatLoopSettings {
  sensitivity: LoopSensitivity;
  minConfidence: number | null;
  autoClose: boolean;
  watchTerms: string[];
}

export interface LoopContext {
  chatId: string;
  userId: string;
  platform: string;
  chatName: string;
  isGroup: boolean;
  memberCount: number | null;
  accountRef: string | null;
  /** Everything in the window, including the overlap tail. */
  window: WindowMessage[];
  /** Only what is new since the cursor — what the gate scores. */
  delta: WindowMessage[];
  roster: ParticipantRef[];
  openLoops: OpenLoopSummary[];
  settings: ChatLoopSettings;
  detectionEnabled: boolean;
  timezone: string;
  consecutiveEmpty: number;
  /** Cursor position to advance to if the pass succeeds. */
  cursorTimestamp: string | null;
  cursorMessageId: string | null;
}

interface RosterRow {
  identity_key: string;
  display_name: string;
  contact_id: string | null;
  is_self: boolean;
}

interface OpenLoopRow {
  id: string;
  title: string | null;
  content: string | null;
  state_summary: string | null;
  owner: string | null;
  deadline: string | null;
  deadline_precision: string | null;
  thread_state: string | null;
}

interface MessageRow {
  id: string;
  content: string | null;
  timestamp: string;
  from_me: boolean;
  contact_name: string | null;
  contact_id: string | null;
  mentions: string[] | null;
  mentions_room: boolean | null;
  reply_to_message_id: string | null;
  thread_root_platform_id: string | null;
}

/**
 * Default sensitivity for a chat with no explicit setting.
 *
 * Channel platforms default low: one work Slack produces an order of magnitude
 * more traffic than a family group, and almost none of it concerns any one
 * person. Users opt channels in rather than opting a firehose out.
 */
function defaultSensitivity(platform: string, isGroup: boolean, userDefault: LoopSensitivity): LoopSensitivity {
  if (!isGroup) return 'normal';
  const semantics = loopSemanticsFor(platform);
  if (semantics.groupModel === 'channels') return semantics.defaultGroupSensitivity;
  return userDefault;
}

/**
 * Build the detection context for one chat.
 *
 * Returns null when the chat cannot be read at all — the caller treats that as
 * "skip", never as "no loops here".
 */
export async function buildLoopContext(userId: string, chatId: string): Promise<LoopContext | null> {
  const { data: chat, error: chatError } = await supabase
    .from('chats')
    .select('id, name, platform, is_group, member_count, platform_chat_id')
    .eq('id', chatId)
    .eq('user_id', userId)
    .maybeSingle();

  if (chatError || !chat) {
    logger.warn('[loops] cannot build context, chat not readable', { chatId, error: chatError?.message });
    return null;
  }

  const [cursorResult, settingsResult, prefsResult] = await Promise.all([
    supabase
      .from('chat_loop_cursors')
      .select('last_message_timestamp, last_message_id, consecutive_empty')
      .eq('user_id', userId)
      .eq('chat_id', chatId)
      .maybeSingle(),
    supabase
      .from('chat_loop_settings')
      .select('sensitivity, min_confidence, auto_close, watch_terms')
      .eq('user_id', userId)
      .eq('chat_id', chatId)
      .maybeSingle(),
    supabase
      .from('user_preferences')
      .select('timezone, loop_detection_enabled, default_group_sensitivity')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  const cursorTimestamp: string | null = cursorResult.data?.last_message_timestamp ?? null;
  const consecutiveEmpty: number = cursorResult.data?.consecutive_empty ?? 0;

  const userDefaultSensitivity = (prefsResult.data?.default_group_sensitivity ?? 'normal') as LoopSensitivity;
  const settings: ChatLoopSettings = {
    sensitivity: (settingsResult.data?.sensitivity as LoopSensitivity) ??
      defaultSensitivity(chat.platform, !!chat.is_group, userDefaultSensitivity),
    minConfidence: settingsResult.data?.min_confidence ?? null,
    autoClose: settingsResult.data?.auto_close ?? true,
    watchTerms: settingsResult.data?.watch_terms ?? [],
  };

  const rows = await fetchWindowRows(userId, chatId, cursorTimestamp);
  if (!rows.length) {
    logger.debug('[loops] empty window', { chatId });
  }

  const selfName = 'You';
  const window = rows.map((row, index) => toWindowMessage(row, index, selfName));

  // The delta is what the gate scores: everything strictly newer than the
  // cursor. The overlap tail is context for the model, not new information.
  const delta = cursorTimestamp
    ? window.filter((m) => m.at > cursorTimestamp)
    : window;

  const [roster, openLoops] = await Promise.all([
    fetchRoster(userId, chatId, window),
    fetchOpenLoops(userId, chatId),
  ]);

  const newest = rows[rows.length - 1];

  return {
    chatId,
    userId,
    platform: chat.platform,
    chatName: chat.name || 'Conversation',
    isGroup: !!chat.is_group,
    memberCount: chat.member_count ?? null,
    accountRef: chat.platform_chat_id ?? null,
    window,
    delta,
    roster,
    openLoops,
    settings,
    detectionEnabled: prefsResult.data?.loop_detection_enabled ?? true,
    timezone: prefsResult.data?.timezone || 'UTC',
    consecutiveEmpty,
    cursorTimestamp: newest?.timestamp ?? cursorTimestamp,
    cursorMessageId: newest?.id ?? null,
  };
}

/**
 * Read the window with keyset pagination, then trim to the caps from the newest
 * end — the most recent messages are the ones that resolve open loops.
 */
async function fetchWindowRows(
  userId: string,
  chatId: string,
  cursorTimestamp: string | null,
): Promise<MessageRow[]> {
  const select =
    'id, content, timestamp, from_me, contact_name, contact_id, mentions, mentions_room, reply_to_message_id, thread_root_platform_id';

  let query = supabase
    .from('messages')
    .select(select)
    .eq('user_id', userId)
    .eq('chat_id', chatId)
    .eq('is_deleted', false)
    .order('timestamp', { ascending: false })
    .limit(WINDOW_MAX_MESSAGES + WINDOW_OVERLAP);

  // Read a little before the cursor so a loop spanning the boundary stays whole.
  if (cursorTimestamp) {
    const overlapStart = new Date(new Date(cursorTimestamp).getTime() - 1000 * 60 * 60 * 6).toISOString();
    query = query.gte('timestamp', overlapStart);
  }

  const { data, error } = await query;
  if (error) {
    logger.warn('[loops] window read failed', { chatId, error: error.message });
    return [];
  }

  // Restore chronological order and drop anything with no text to reason about.
  const rows = ((data ?? []) as MessageRow[])
    .reverse()
    .filter((row) => (row.content ?? '').trim().length > 0);

  let budget = WINDOW_MAX_CHARS;
  const kept: MessageRow[] = [];
  for (let i = rows.length - 1; i >= 0 && kept.length < WINDOW_MAX_MESSAGES; i -= 1) {
    const row = rows[i];
    const cost = (row.content ?? '').length;
    if (cost > budget && kept.length > 0) break;
    budget -= cost;
    kept.unshift(row);
  }

  return kept;
}

function toWindowMessage(row: MessageRow, index: number, selfName: string): WindowMessage {
  return {
    id: row.id,
    ref: `m${index + 1}`,
    senderName: row.from_me ? selfName : row.contact_name || 'Unknown',
    isSelf: row.from_me,
    content: (row.content ?? '').trim(),
    at: row.timestamp,
    mentions: row.mentions ?? undefined,
    mentionsRoom: row.mentions_room ?? undefined,
    replyToId: row.reply_to_message_id ?? undefined,
  };
}

/**
 * The participant roster.
 *
 * Prefers the materialized chat_participants table and falls back to deriving
 * it from the window, so a chat whose roster has not been populated yet still
 * scores rather than silently looking like a two-person conversation.
 */
async function fetchRoster(userId: string, chatId: string, window: WindowMessage[]): Promise<ParticipantRef[]> {
  const { data, error } = await supabase
    .from('chat_participants')
    .select('identity_key, display_name, contact_id, is_self')
    .eq('user_id', userId)
    .eq('chat_id', chatId)
    .order('last_seen_at', { ascending: false })
    .limit(MAX_ROSTER);

  if (!error && data?.length) {
    return (data as RosterRow[]).map((row) => ({
      identityKey: row.identity_key,
      displayName: row.display_name,
      contactId: row.contact_id,
      isSelf: row.is_self,
    }));
  }

  const derived = new Map<string, ParticipantRef>();
  for (const message of window) {
    const key = message.isSelf ? 'self' : normalizeAlias(message.senderName) || message.senderName;
    if (!derived.has(key)) {
      derived.set(key, {
        identityKey: key,
        displayName: message.senderName,
        contactId: null,
        isSelf: message.isSelf,
      });
    }
  }
  return [...derived.values()].slice(0, MAX_ROSTER);
}

async function fetchOpenLoops(userId: string, chatId: string): Promise<OpenLoopSummary[]> {
  const { data, error } = await supabase
    .from('loops')
    .select('id, title, content, state_summary, owner, deadline, deadline_precision, thread_state')
    .eq('user_id', userId)
    .eq('chat_id', chatId)
    .eq('visibility', 'surfaced')
    .in('status', LIVE_STATUSES)
    .order('last_evidence_at', { ascending: false, nullsFirst: false })
    .limit(MAX_OPEN_LOOPS);

  if (error) {
    // A failure here must not be read as "no open loops": that would make the
    // model create duplicates of loops it cannot see.
    throw new Error(`OPEN_LOOPS_READ_FAILED: ${error.message}`);
  }

  return ((data ?? []) as OpenLoopRow[]).map((row) => ({
    id: row.id,
    title: row.title || row.content || 'Untitled',
    state: row.thread_state ?? null,
    stateSummary: row.state_summary ?? null,
    owner: row.owner ?? 'unknown',
    deadline: row.deadline ?? null,
    deadlinePrecision: row.deadline_precision ?? 'none',
  }));
}
