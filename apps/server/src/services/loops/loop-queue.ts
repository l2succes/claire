/**
 * Debounced, per-chat scheduling.
 *
 * The old detector ran once per message. A twenty-message burst in a group chat
 * therefore cost twenty model calls and produced up to twenty disconnected rows
 * — which is both the cost problem and the duplicate-fragments problem, and they
 * have the same fix: wait for the conversation to settle, then look at it once.
 *
 * Trailing debounce with a hard cap: each new message pushes the run back, but
 * never past LOOP_MAX_DELAY_MS, so a chat that never goes quiet still gets
 * processed.
 *
 * See /docs/plans/loops-revamp §5.
 */

import Bull from 'bull';

import { redisConfig } from '../../config';
import { logger } from '../../utils/logger';
import { detectLoopsForChat, detectionMode } from './loop-detector';

const DEBOUNCE_MS = parseInt(process.env.LOOP_DEBOUNCE_MS ?? '45000', 10);
const MAX_DELAY_MS = parseInt(process.env.LOOP_MAX_DELAY_MS ?? '180000', 10);

interface LoopJob {
  userId: string;
  chatId: string;
  /** When this chat's pending run was first scheduled, for the hard cap. */
  firstScheduledAt: number;
}

let queue: Bull.Queue<LoopJob> | null = null;

/** Per-chat first-scheduled timestamps, so the cap survives re-scheduling. */
const pendingSince = new Map<string, number>();

function jobKey(userId: string, chatId: string): string {
  return `loop:${userId}:${chatId}`;
}

function getQueue(): Bull.Queue<LoopJob> | null {
  if (detectionMode() !== 'queue') return null;
  if (queue) return queue;

  try {
    queue = new Bull<LoopJob>('loop-detection', {
      // redisConfig is a union: Railway supplies REDIS_URL, local dev supplies
      // host/port. Narrow rather than reaching for a field that may not exist.
      redis: 'url' in redisConfig
        ? redisConfig.url
        : { host: redisConfig.host, port: redisConfig.port, password: redisConfig.password },
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 2,
        backoff: { type: 'exponential', delay: 30_000 },
      },
    });

    queue.process(async (job) => {
      pendingSince.delete(jobKey(job.data.userId, job.data.chatId));
      return detectLoopsForChat(job.data.userId, job.data.chatId);
    });

    queue.on('failed', (job, error) => {
      logger.warn('[loops] detection job failed', {
        chatId: job?.data?.chatId,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    logger.info('[loops] detection queue ready', { debounceMs: DEBOUNCE_MS, maxDelayMs: MAX_DELAY_MS });
    return queue;
  } catch (error) {
    logger.error('[loops] could not create detection queue', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Schedule a detection pass for a chat.
 *
 * In `inline` mode this runs immediately — used by tests, the mock bridge, and
 * self-hosters without Redis. In `off` mode it does nothing at all.
 */
export async function scheduleChat(userId: string, chatId: string): Promise<void> {
  const mode = detectionMode();
  if (mode === 'off') return;

  if (mode === 'inline') {
    try {
      await detectLoopsForChat(userId, chatId);
    } catch (error) {
      logger.warn('[loops] inline detection failed', {
        chatId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  const active = getQueue();
  if (!active) return;

  const key = jobKey(userId, chatId);
  const now = Date.now();
  const firstScheduledAt = pendingSince.get(key) ?? now;
  pendingSince.set(key, firstScheduledAt);

  // Never push the run past the hard cap, even in a conversation that keeps
  // producing messages.
  const elapsed = now - firstScheduledAt;
  const delay = Math.max(0, Math.min(DEBOUNCE_MS, MAX_DELAY_MS - elapsed));

  try {
    // A fixed jobId plus removeOnComplete makes this a replace-in-place: the
    // previously scheduled run for this chat is cancelled and re-timed.
    const existing = await active.getJob(key);
    if (existing) {
      const state = await existing.getState();
      if (state === 'delayed' || state === 'waiting') {
        await existing.remove();
      }
    }

    await active.add({ userId, chatId, firstScheduledAt }, { delay, jobId: key });
  } catch (error) {
    logger.warn('[loops] could not schedule detection', {
      chatId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Shut the queue down. Used by tests and graceful shutdown. */
export async function closeLoopQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
  pendingSince.clear();
}
