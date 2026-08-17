import Bull from 'bull';
import { redisConfig } from '../config';
import { logger } from '../utils/logger';
import { supabase } from './supabase';
import { pushNotificationService } from './push-notification';

interface ReminderJob {
  loopId: string;
  userId: string;
  content: string;
  deadline: string;
  priority: string;
}

/**
 * How often (ms) the scheduler polls for due loops.
 * Defaults to 60 s; override via REMINDER_POLL_INTERVAL_MS env var.
 */
const POLL_INTERVAL_MS = parseInt(process.env.REMINDER_POLL_INTERVAL_MS ?? '60000', 10);

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
      const bull = new Bull<ReminderJob>('loop-reminders', {
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
        logger.info(`[reminder] job ${job.id} completed for loop ${job.data?.loopId}`);
      });
      bull.on('failed', (job: any, err: Error) => {
        logger.error(`[reminder] job ${job.id} failed for loop ${job.data?.loopId}:`, err.message);
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
   * Poll Supabase for loops whose deadline is within the next 24 hours
   * and that haven't already had a reminder sent.  Enqueue a job for each.
   */
  async enqueueDeadlineReminders(): Promise<void> {
    try {
      const now = new Date();
      const horizon = new Date(now.getTime() + 24 * 60 * 60 * 1000); // +24h

      // A loop is due at COALESCE(snoozed_until, deadline): snoozing pushes the
      // reminder out without touching the date the user committed to. PostgREST
      // has no COALESCE in filters, so the two cases are spelled out — an
      // un-snoozed loop reaching its deadline, or a snooze expiring.
      const from = now.toISOString();
      const to = horizon.toISOString();
      const { data: loops, error } = await supabase
        .from('loops')
        .select('id, user_id, content, title, deadline, snoozed_until, priority')
        .in('status', ['open', 'waiting', 'snoozed'])
        .is('reminder_sent_at', null)
        .or(
          `and(snoozed_until.is.null,deadline.gte.${from},deadline.lte.${to}),` +
          `and(snoozed_until.gte.${from},snoozed_until.lte.${to})`,
        );

      if (error) {
        logger.error('[reminder] failed to query loops:', error.message);
        return;
      }

      if (!loops || loops.length === 0) {
        logger.debug('[reminder] no due loops found');
        return;
      }

      logger.info(`[reminder] enqueuing ${loops.length} reminder(s)`);

      for (const p of loops) {
        await this.enqueueReminder({
          loopId: p.id,
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
    // Use the loop ID as jobId to prevent duplicates on repeated polls.
    await this.queue.add(data, { jobId: `reminder-${data.loopId}` });
    logger.debug(`[reminder] enqueued job for loop ${data.loopId}`);
  }

  /** Bull job processor: send push and mark loop as reminded. */
  private async processReminderJob(job: { data: ReminderJob }): Promise<{ sent: boolean }> {
    const { loopId, userId, content } = job.data;

    await pushNotificationService.sendToUser(userId, {
      title: 'Loop reminder',
      body: content,
      sound: 'default',
      data: { type: 'loop-reminder', loopId },
    });

    const { error } = await supabase
      .from('loops')
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq('id', loopId);

    if (error) {
      logger.error(`[reminder] failed to update reminder_sent_at for ${loopId}:`, error.message);
      throw new Error(error.message);
    }

    return { sent: true };
  }

  /** Exposed for testing: directly process a reminder without going through Bull. */
  async triggerReminderForLoop(loopId: string): Promise<{ sent: boolean }> {
    const { data: loop, error } = await supabase
      .from('loops')
      .select('id, user_id, content, deadline, priority')
      .eq('id', loopId)
      .single();

    if (error || !loop) {
      throw new Error(`Loop not found: ${loopId}`);
    }

    return this.processReminderJob({
      data: {
        loopId: loop.id,
        userId: loop.user_id,
        content: loop.content,
        deadline: loop.deadline,
        priority: loop.priority ?? 'medium',
      },
    });
  }

  get isStarted(): boolean {
    return this.started;
  }
}

export const reminderScheduler = new ReminderScheduler();
