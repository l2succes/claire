import Bull, { Queue, Job } from 'bull';
import { redisConfig } from '../config';
import { logger } from '../utils/logger';
import { supabase } from './supabase';

interface ReminderJob {
  promiseId: string;
  userId: string;
  content: string;
  deadline: string;
  priority: string;
}

/**
 * How often (ms) the scheduler polls for due promises.
 * Defaults to 60 s; override via REMINDER_POLL_INTERVAL_MS env var.
 */
const POLL_INTERVAL_MS = parseInt(process.env.REMINDER_POLL_INTERVAL_MS ?? '60000', 10);

/**
 * Mock push sender — replace with real Expo Push API when push_tokens land.
 * Returns true so tests can assert the call was made.
 */
export async function sendMockPush(userId: string, promiseId: string, content: string): Promise<boolean> {
  logger.info(`[reminder] MOCK push → userId=${userId} promiseId=${promiseId} content="${content}"`);
  return true;
}

/** Minimal queue interface — implemented by Bull in prod, by a stub in tests. */
export interface ReminderQueue {
  add(data: ReminderJob, opts: { jobId: string }): Promise<{ id: string | number }>;
  process(fn: (job: { data: ReminderJob }) => Promise<any>): void;
  on(event: string, fn: (...args: any[]) => void): void;
  close(): Promise<void>;
}

class ReminderScheduler {
  private queue: ReminderQueue | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private started = false;

  /**
   * Inject a stub queue — must be called before start().
   * Used in unit tests to avoid a real Redis connection.
   */
  _setQueue(q: ReminderQueue): void {
    this.queue = q;
  }

  /** Start the scheduler: initialises the Bull queue (if not already injected) and begins polling. */
  start(): void {
    if (this.started) return;
    this.started = true;

    if (!this.queue) {
      const bull = new Bull<ReminderJob>('promise-reminders', {
        redis: {
          host: redisConfig.host,
          port: redisConfig.port,
          password: redisConfig.password,
        },
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        },
      }) as unknown as ReminderQueue;

      bull.on('completed', (job: any) => {
        logger.info(`[reminder] job ${job.id} completed for promise ${job.data?.promiseId}`);
      });
      bull.on('failed', (job: any, err: Error) => {
        logger.error(`[reminder] job ${job.id} failed for promise ${job.data?.promiseId}:`, err.message);
      });

      bull.process(this.processReminderJob.bind(this));
      this.queue = bull;
    }

    // Start polling loop
    this.pollTimer = setInterval(() => this.enqueueDeadlineReminders(), POLL_INTERVAL_MS);
    // Run once immediately so we don't wait for the first interval
    this.enqueueDeadlineReminders();

    logger.info('[reminder] scheduler started');
  }

  /** Stop polling and close the queue gracefully. */
  async stop(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.queue) {
      await this.queue.close();
      this.queue = null;
    }
    this.started = false;
    logger.info('[reminder] scheduler stopped');
  }

  /**
   * Poll Supabase for promises whose deadline is within the next 24 hours
   * and that haven't already had a reminder sent.  Enqueue a job for each.
   */
  async enqueueDeadlineReminders(): Promise<void> {
    try {
      const now = new Date();
      const horizon = new Date(now.getTime() + 24 * 60 * 60 * 1000); // +24h

      const { data: promises, error } = await supabase
        .from('promises')
        .select('id, user_id, content, deadline, priority')
        .lte('deadline', horizon.toISOString())
        .gte('deadline', now.toISOString())
        .eq('status', 'pending')
        .is('reminder_sent_at', null);

      if (error) {
        logger.error('[reminder] failed to query promises:', error.message);
        return;
      }

      if (!promises || promises.length === 0) {
        logger.debug('[reminder] no due promises found');
        return;
      }

      logger.info(`[reminder] enqueuing ${promises.length} reminder(s)`);

      for (const p of promises) {
        await this.enqueueReminder({
          promiseId: p.id,
          userId: p.user_id,
          content: p.content,
          deadline: p.deadline,
          priority: p.priority ?? 'medium',
        });
      }
    } catch (err) {
      logger.error('[reminder] enqueueDeadlineReminders error:', (err as Error).message);
    }
  }

  /** Enqueue a single reminder job, deduplicating by jobId. */
  async enqueueReminder(data: ReminderJob): Promise<void> {
    if (!this.queue) {
      logger.warn('[reminder] queue not initialised — skipping enqueue');
      return;
    }
    // Use the promise ID as jobId to prevent duplicates on repeated polls.
    await this.queue.add(data, { jobId: `reminder-${data.promiseId}` });
    logger.debug(`[reminder] enqueued job for promise ${data.promiseId}`);
  }

  /** Bull job processor: send push and mark promise as reminded. */
  private async processReminderJob(job: { data: ReminderJob }): Promise<{ sent: boolean }> {
    const { promiseId, userId, content } = job.data;

    const sent = await sendMockPush(userId, promiseId, content);

    if (sent) {
      const { error } = await supabase
        .from('promises')
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq('id', promiseId);

      if (error) {
        logger.error(`[reminder] failed to update reminder_sent_at for ${promiseId}:`, error.message);
        throw new Error(error.message);
      }
    }

    return { sent };
  }

  /** Exposed for testing: directly process a reminder without going through Bull. */
  async triggerReminderForPromise(promiseId: string): Promise<{ sent: boolean }> {
    const { data: promise, error } = await supabase
      .from('promises')
      .select('id, user_id, content, deadline, priority')
      .eq('id', promiseId)
      .single();

    if (error || !promise) {
      throw new Error(`Promise not found: ${promiseId}`);
    }

    return this.processReminderJob({
      data: {
        promiseId: promise.id,
        userId: promise.user_id,
        content: promise.content,
        deadline: promise.deadline,
        priority: promise.priority ?? 'medium',
      },
    });
  }

  get isStarted(): boolean {
    return this.started;
  }
}

export const reminderScheduler = new ReminderScheduler();
