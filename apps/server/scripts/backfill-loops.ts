/**
 * Scan a user's existing conversations for open loops.
 *
 * Runs locally with Railway variables injected. It processes chronological,
 * bounded message windows and advances each live cursor only after its whole
 * scan succeeds. No message text is printed.
 *
 * Example:
 * LOOP_BACKFILL_USER_ID=<uuid> LOOP_BACKFILL_CONFIRM=<uuid> \
 *   LOOP_BACKFILL_DAYS=30 LOOP_DETECTION_MODE=inline bun run scripts/backfill-loops.ts
 *
 * Add LOOP_BACKFILL_FORCE=1 only for an intentional re-evaluation of chats
 * that already completed a historical scan (for example, after a detector
 * contract change). It does not bypass the date or message safety caps.
 */

import { detectLoopsForChat, type DetectionResult } from '../src/services/loops/loop-detector';
import { advanceCursor } from '../src/services/loops/loop-store';
import { supabase } from '../src/services/supabase';

const userId = process.env.LOOP_BACKFILL_USER_ID;
const confirmation = process.env.LOOP_BACKFILL_CONFIRM;
const days = Number.parseInt(process.env.LOOP_BACKFILL_DAYS ?? '30', 10);
const force = process.env.LOOP_BACKFILL_FORCE === '1';
const requestedChatIds = new Set(
  (process.env.LOOP_BACKFILL_CHAT_IDS ?? '')
    .split(',')
    .map((chatId) => chatId.trim())
    .filter(Boolean),
);
const BATCH_SIZE = 40;
const MAX_MESSAGES = 10_000;
const CONCURRENCY = 3;
const MAX_WINDOW_ATTEMPTS = 3;

const COMPLETE_SKIP_REASONS = new Set([
  'sensitivity_off',
  'detection_disabled',
  'window_empty',
  'window_too_short',
  'no_human_message',
  'no_signal',
  'backoff',
]);
const RETRIABLE_SKIP_REASONS = new Set(['extraction_failed', 'context_error']);

if (!userId || confirmation !== userId) {
  throw new Error('Set LOOP_BACKFILL_USER_ID and matching LOOP_BACKFILL_CONFIRM before running this script.');
}
if (!Number.isInteger(days) || days < 1 || days > 365) {
  throw new Error('LOOP_BACKFILL_DAYS must be an integer from 1 through 365.');
}

interface HistoricalMessage {
  id: string;
  chat_id: string;
  timestamp: string;
}

const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
const { data, error } = await supabase
  .from('messages')
  .select('id, chat_id, timestamp')
  .eq('user_id', userId)
  .eq('is_deleted', false)
  .gte('timestamp', cutoff)
  .not('content', 'is', null)
  .order('timestamp', { ascending: true })
  .limit(MAX_MESSAGES);

if (error) throw new Error(`Reading historical messages: ${error.message}`);
const messages = (data ?? []) as HistoricalMessage[];
if (messages.length === MAX_MESSAGES) {
  throw new Error(`Historical scan reached the ${MAX_MESSAGES}-message safety cap; reduce LOOP_BACKFILL_DAYS.`);
}

const byChat = new Map<string, HistoricalMessage[]>();
for (const message of messages) {
  const chatMessages = byChat.get(message.chat_id) ?? [];
  chatMessages.push(message);
  byChat.set(message.chat_id, chatMessages);
}

const totals = {
  chats: 0, windows: 0, attempts: 0, retries: 0, ran: 0, created: 0,
  updated: 0, closed: 0, suppressed: 0, skipped: 0, incompleteChats: 0, failedWindows: 0,
};

function completed(result: DetectionResult): boolean {
  return result.ran || (!!result.skipReason && COMPLETE_SKIP_REASONS.has(result.skipReason));
}

function retryable(result: DetectionResult): boolean {
  return !!result.skipReason && RETRIABLE_SKIP_REASONS.has(result.skipReason);
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function detectHistoricalBatch(chatId: string, messageIds: string[]): Promise<DetectionResult | null> {
  for (let attempt = 1; attempt <= MAX_WINDOW_ATTEMPTS; attempt += 1) {
    totals.attempts += 1;
    try {
      const result = await detectLoopsForChat(userId, chatId, { messageIds, advanceCursor: false });
      if (completed(result)) return result;
      if (!retryable(result) || attempt === MAX_WINDOW_ATTEMPTS) {
        console.warn(JSON.stringify({ incompleteWindow: { chatId, skipReason: result.skipReason, attempts: attempt } }));
        return null;
      }
    } catch (error) {
      if (attempt === MAX_WINDOW_ATTEMPTS) {
        console.warn(JSON.stringify({ incompleteWindow: { chatId, error: error instanceof Error ? error.message : String(error), attempts: attempt } }));
        return null;
      }
    }
    totals.retries += 1;
    await pause(500 * attempt);
  }
  return null;
}

async function processChat(chatId: string, chatMessages: HistoricalMessage[]): Promise<void> {
  const newest = chatMessages[chatMessages.length - 1];
  const { data: cursor, error: cursorError } = await supabase
    .from('chat_loop_cursors')
    .select('last_message_timestamp, last_gate_result')
    .eq('user_id', userId)
    .eq('chat_id', chatId)
    .maybeSingle();
  if (cursorError) throw new Error(`Reading backfill cursor: ${cursorError.message}`);

  // A rerun after an interruption resumes at chat boundaries. A completed chat
  // has already advanced its cursor past the snapshot that this run selected.
  if (
    !force &&
    cursor?.last_gate_result === 'history_backfill' &&
    cursor.last_message_timestamp &&
    cursor.last_message_timestamp >= newest.timestamp
  ) {
    totals.skipped += 1;
    return;
  }

  let producedOps = false;
  totals.chats += 1;

  for (let start = 0; start < chatMessages.length; start += BATCH_SIZE) {
    const batch = chatMessages.slice(start, start + BATCH_SIZE);
    totals.windows += 1;
    const result = await detectHistoricalBatch(chatId, batch.map((message) => message.id));
    if (!result) {
      totals.failedWindows += 1;
      totals.incompleteChats += 1;
      console.warn(JSON.stringify({ incompleteChat: { chatId, windowsProcessed: Math.ceil((start + batch.length) / BATCH_SIZE) } }));
      return;
    }
    if (result.ran) totals.ran += 1;
    else totals.skipped += 1;
    totals.created += result.created;
    totals.updated += result.updated;
    totals.closed += result.closed;
    totals.suppressed += result.suppressed;
    producedOps ||= result.created + result.updated + result.closed + result.suppressed > 0;
  }

  await advanceCursor(userId, chatId, newest.timestamp, newest.id, producedOps, 'history_backfill');
  console.log(JSON.stringify({ progress: { chats: totals.chats, windows: totals.windows, created: totals.created } }));
}

const jobs = [...byChat.entries()].filter(([chatId]) => requestedChatIds.size === 0 || requestedChatIds.has(chatId));
if (requestedChatIds.size > 0 && jobs.length === 0) {
  throw new Error('LOOP_BACKFILL_CHAT_IDS did not match any messages in the selected date range.');
}
let nextJob = 0;
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, async () => {
  while (nextJob < jobs.length) {
    const job = jobs[nextJob++];
    await processChat(job[0], job[1]);
  }
}));

const complete = totals.incompleteChats === 0;
console.log(JSON.stringify({ ok: complete, days, force, messages: messages.length, ...totals }));
if (!complete) process.exitCode = 2;
