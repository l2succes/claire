import Bull from 'bull';
import { redisConfig } from '../config';
import { logger } from '../utils/logger';
import { notificationDeliveryService } from './notification-delivery';
import { planLoopReminder, type LoopReminderReason } from './loops/loop-reminder-policy';
import { recordEvent } from './loops/loop-store';
import { supabase } from './supabase';

interface ReminderJob {
  loopId: string;
  revision: number;
  reminderCount: number;
  userId: string;
  title: string;
  content: string;
  reason: LoopReminderReason;
}

interface ReminderLoopRow {
  id: string;
  user_id: string;
  title: string | null;
  content: string;
  status: string;
  visibility: string;
  owner: string | null;
  thread_state: string | null;
  deadline: string | null;
  deadline_precision: string | null;
  snoozed_until: string | null;
  priority_score: number | null;
  reminder_revision: number;
  reminder_count: number;
  reminder_reason: LoopReminderReason | null;
}

const POLL_INTERVAL_MS = parseInt(process.env.REMINDER_POLL_INTERVAL_MS ?? '60000', 10);
const NO_DEVICE_RETRY_MS = 6 * 60 * 60 * 1000;

/** Minimal queue interface — implemented by Bull in prod, by a stub in tests. */
export interface ReminderQueue {
  add(data: ReminderJob, opts: { jobId: string }): Promise<{ id: string | number }>;
  process(fn: (job: { data: ReminderJob }) => Promise<any>): void;
  on(event: string, fn: (...args: any[]) => void): void;
  close(): Promise<void>;
}

function notificationCopy(reason: LoopReminderReason, title: string): { title: string; body: string } {
  if (reason === 'snooze_ended') return { title: 'Ready when you are', body: title };
  if (reason === 'act_now') return { title: 'This loop needs attention', body: title };
  if (reason === 'follow_up') return { title: 'Time to follow up', body: title };
  return { title: 'Coming up', body: title };
}

export class ReminderScheduler {
  private queue: ReminderQueue | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private started = false;

  _setQueue(q: ReminderQueue): void {
    this.queue = q;
  }

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
      bull.on('completed', (job: any) => logger.info(`[reminder] job ${job.id} completed for loop ${job.data?.loopId}`));
      bull.on('failed', (job: any, err: Error) => logger.error(`[reminder] job ${job.id} failed for loop ${job.data?.loopId}:`, err.message));
      bull.process(this.processReminderJob.bind(this));
      this.queue = bull;
    }
    this.pollTimer = setInterval(() => void this.runOnce(), POLL_INTERVAL_MS);
    void this.runOnce();
    logger.info('[reminder] scheduler started');
  }

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

  async runOnce(now = new Date()): Promise<void> {
    await this.refreshPendingPlans(now);
    await this.enqueueDeadlineReminders(now);
  }

  /** Recompute only loop revisions invalidated by a meaningful semantic edit. */
  async refreshPendingPlans(now = new Date()): Promise<void> {
    const { data: loops, error } = await supabase
      .from('loops')
      .select('id,user_id,title,content,status,visibility,owner,thread_state,deadline,deadline_precision,snoozed_until,priority_score,reminder_revision,reminder_count,reminder_reason')
      .eq('reminder_plan_state', 'pending')
      .limit(500);
    if (error) {
      logger.error('[reminder] failed to load pending plans:', error.message);
      return;
    }
    if (!loops?.length) return;

    const userIds = [...new Set((loops as ReminderLoopRow[]).map((loop) => loop.user_id))];
    const { data: devices } = await supabase
      .from('notification_devices')
      .select('user_id,timezone,last_seen_at')
      .in('user_id', userIds)
      .eq('enabled', true)
      .order('last_seen_at', { ascending: false });
    const timezoneByUser = new Map<string, string>();
    for (const device of devices || []) {
      if (!timezoneByUser.has(device.user_id)) timezoneByUser.set(device.user_id, device.timezone || 'UTC');
    }

    for (const loop of loops as ReminderLoopRow[]) {
      const plan = planLoopReminder({
        status: loop.status,
        visibility: loop.visibility,
        owner: loop.owner,
        threadState: loop.thread_state,
        deadline: loop.deadline,
        deadlinePrecision: loop.deadline_precision,
        snoozedUntil: loop.snoozed_until,
        priorityScore: loop.priority_score,
        timezone: timezoneByUser.get(loop.user_id) || 'UTC',
        now,
      });
      const patch = plan.state === 'scheduled'
        ? { reminder_plan_state: 'scheduled', next_reminder_at: plan.at.toISOString(), reminder_reason: plan.reason }
        : { reminder_plan_state: 'quiet', next_reminder_at: null, reminder_reason: null };
      const { error: updateError } = await supabase
        .from('loops')
        .update(patch)
        .eq('id', loop.id)
        .eq('reminder_revision', loop.reminder_revision);
      if (updateError) logger.warn('[reminder] failed to persist plan', { loopId: loop.id, error: updateError.message });
    }
  }

  /** Enqueue plans whose chosen moment has arrived. */
  async enqueueDeadlineReminders(now = new Date()): Promise<void> {
    try {
      const { data: loops, error } = await supabase
        .from('loops')
        .select('id,user_id,title,content,reminder_revision,reminder_count,reminder_reason')
        .eq('reminder_plan_state', 'scheduled')
        .lte('next_reminder_at', now.toISOString())
        .limit(500);
      if (error) {
        logger.error('[reminder] failed to query due loop plans:', error.message);
        return;
      }
      for (const loop of (loops || []) as ReminderLoopRow[]) {
        if (!loop.reminder_reason) continue;
        await this.enqueueReminder({
          loopId: loop.id,
          revision: loop.reminder_revision,
          reminderCount: loop.reminder_count,
          userId: loop.user_id,
          title: loop.title || loop.content,
          content: loop.content,
          reason: loop.reminder_reason,
        });
      }
    } catch (err) {
      logger.error('[reminder] enqueueDeadlineReminders error:', (err as Error).message);
    }
  }

  async enqueueReminder(data: ReminderJob): Promise<void> {
    if (!this.queue) {
      logger.warn('[reminder] queue not initialised — skipping enqueue');
      return;
    }
    await this.queue.add(data, { jobId: `reminder-${data.loopId}-r${data.revision}` });
  }

  private async processReminderJob(job: { data: ReminderJob }): Promise<{ sent: boolean }> {
    const data = job.data;
    const copy = notificationCopy(data.reason, data.title);
    const result = await notificationDeliveryService.enqueueLoopReminder({
      loopId: data.loopId,
      revision: data.revision,
      userId: data.userId,
      title: copy.title,
      body: copy.body,
      reason: data.reason,
    });

    if (result.outcome === 'no_devices') {
      await supabase.from('loops').update({
        next_reminder_at: new Date(Date.now() + NO_DEVICE_RETRY_MS).toISOString(),
      }).eq('id', data.loopId).eq('reminder_revision', data.revision);
      return { sent: false };
    }

    const sent = result.queued > 0;
    const { error } = await supabase.from('loops').update({
      reminder_plan_state: result.outcome === 'disabled' ? 'quiet' : 'sent',
      reminder_sent_at: sent ? new Date().toISOString() : null,
      reminder_count: sent ? data.reminderCount + 1 : data.reminderCount,
      next_reminder_at: null,
    }).eq('id', data.loopId).eq('reminder_revision', data.revision);
    if (error) throw new Error(error.message);
    if (sent) {
      await recordEvent({
        loopId: data.loopId,
        userId: data.userId,
        kind: 'reminder_sent',
        actor: 'system',
        summary: copy.title,
        payload: { reason: data.reason, revision: data.revision },
      });
    }
    return { sent };
  }

  async triggerReminderForLoop(loopId: string): Promise<{ sent: boolean }> {
    const { data: loop, error } = await supabase
      .from('loops')
      .select('id,user_id,title,content,reminder_revision,reminder_count')
      .eq('id', loopId)
      .single();
    if (error || !loop) throw new Error(`Loop not found: ${loopId}`);
    return this.processReminderJob({ data: {
      loopId: loop.id,
      revision: loop.reminder_revision ?? 1,
      reminderCount: loop.reminder_count ?? 0,
      userId: loop.user_id,
      title: loop.title || loop.content,
      content: loop.content,
      reason: 'act_now',
    } });
  }

  get isStarted(): boolean {
    return this.started;
  }
}

export const reminderScheduler = new ReminderScheduler();
