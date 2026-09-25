/** Durable per-chat dirty generations. Redis is not the source of pending work. */
import { supabase } from '../supabase';
import { logger } from '../../utils/logger';
import { detectLoopsForChat, detectionMode } from './loop-detector';

let timer: ReturnType<typeof setInterval> | undefined;
let running: Promise<void> | undefined;
const BLOCKED = new Set(['detection_disabled', 'ai_disabled', 'sensitivity_off', 'weak_identity', 'detection_mode_off']);

export async function runLoopWorkOnce(): Promise<void> {
  if (detectionMode() !== 'queue') return;
  const { data, error } = await supabase.rpc('claim_chat_loop_work');
  if (error) throw error;
  await Promise.all((data ?? []).map(async (work: any) => {
    try {
      const result = await detectLoopsForChat(work.user_id, work.chat_id, { maxIngestSeq: work.generation });
      const blocked = result.skipReason && BLOCKED.has(result.skipReason);
      const { data: cursor, error: cursorError } = await supabase.from('chat_loop_cursors')
        .select('last_ingest_seq').eq('user_id', work.user_id).eq('chat_id', work.chat_id).maybeSingle();
      if (cursorError) throw cursorError;
      const { error: finishError } = await supabase.from('chat_loop_work').update({
        processed_generation: blocked ? work.processed_generation : Math.max(work.processed_generation, cursor?.last_ingest_seq ?? 0),
        lease_until: null, lease_token: null, attempts: 0,
        last_error: blocked ? result.skipReason : null,
        last_success_at: blocked ? work.last_success_at : new Date().toISOString(),
        next_run_at: new Date(Date.now() + (blocked ? 5 * 60_000 : 1000)).toISOString(),
      }).eq('user_id', work.user_id).eq('chat_id', work.chat_id).eq('lease_token', work.lease_token);
      if (finishError) throw finishError;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const { error: persistError } = await supabase.from('chat_loop_work').update({
        lease_until: null, lease_token: null, last_error: message.slice(0, 500),
        next_run_at: new Date(Date.now() + Math.min(60 * 60_000, 30_000 * 2 ** Math.min(work.attempts, 7))).toISOString(),
      }).eq('user_id', work.user_id).eq('chat_id', work.chat_id).eq('lease_token', work.lease_token);
      logger.warn('[loops] durable detection failed', { chatId: work.chat_id, error: message, persistError: persistError?.message });
    }
  }));
}

export function startLoopQueue(): void {
  if (timer || detectionMode() !== 'queue') return;
  const tick = () => {
    if (running) return;
    running = runLoopWorkOnce().catch(error => { logger.error('[loops] worker poll failed', error); }).finally(() => { running = undefined; });
  };
  timer = setInterval(tick, 5000);
  tick();
}

/** The message transaction already marked the chat dirty, including edits. */
export async function scheduleChat(userId: string, chatId: string): Promise<void> {
  if (detectionMode() === 'inline') await detectLoopsForChat(userId, chatId);
  else startLoopQueue();
}

export async function closeLoopQueue(): Promise<void> {
  if (timer) clearInterval(timer);
  timer = undefined;
  await running;
}
