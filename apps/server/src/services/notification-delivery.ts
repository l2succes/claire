import Bull, { Job, Queue } from 'bull';
import { redisConfig } from '../config';
import { supabase } from './supabase';
import { notificationPresence } from './notification-presence';
import { apnsNotificationProvider, expoNotificationProvider, type NotificationPayload, type ProviderResult } from './notification-providers';
import { logger } from '../utils/logger';
import { operationsTelemetry } from './operations-telemetry';
import { isWhatsAppStatusUpdate } from './whatsapp-status';
import { recordLoopActivity, recordMessageActivity } from './in-app-notifications';

interface NotificationDevice {
  id: string;
  user_id: string;
  device_id: string;
  platform: 'ios' | 'android' | 'macos' | 'windows' | 'web';
  provider: 'expo' | 'apns' | 'fcm' | 'webpush';
  token: string;
  enabled: boolean;
  timezone: string;
}

export interface IncomingNotificationEvent {
  userId: string;
  chatId: string;
  platform: string;
  senderContactId?: string;
  senderName?: string;
  chatName?: string;
  isGroup?: boolean;
  content: string;
  messageId: string;
}

interface DeliveryJob {
  kind: 'delivery';
  deliveryId: string;
  device: NotificationDevice;
  payload: NotificationPayload;
  telemetry: { userId: string; platform: string; traceSource: string };
  loop?: { loopId: string; revision: number; userId: string };
}

export interface LoopReminderNotificationEvent {
  loopId: string;
  revision: number;
  userId: string;
  title: string;
  body: string;
  reason: string;
}

export interface NotificationEnqueueResult {
  queued: number;
  outcome: 'queued' | 'disabled' | 'no_devices';
}

interface ReceiptJob {
  kind: 'receipt';
  deliveryId: string;
  deviceId: string;
  receiptId: string;
  telemetry: DeliveryJob['telemetry'];
}

type NotificationJob = DeliveryJob | ReceiptJob;

interface NotificationOptions {
  notify_messages?: boolean;
  notify_loops?: boolean;
  quiet_hours_enabled?: boolean;
  quiet_hours_start?: string;
  quiet_hours_end?: string;
}

export const MESSAGE_NOTIFICATION_CATEGORY = 'claire_message';
export const LOOP_NOTIFICATION_CATEGORY = 'claire_loop';

interface MessageNotificationArtwork {
  senderAvatarUrl?: string;
  chatAvatarUrl?: string;
}

/** Remote notification media must be directly downloadable by APNs/FCM. */
export function notificationImageUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 2_048) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** Build one stable messaging payload for every provider/device. */
export function buildIncomingMessageNotification(
  event: IncomingNotificationEvent,
  badge: number,
  artwork: MessageNotificationArtwork = {},
): NotificationPayload {
  const isGroup = event.isGroup === true;
  const senderName = event.senderName?.trim()
    || (!isGroup ? event.chatName?.trim() : undefined)
    || 'New message';
  const chatName = event.chatName?.trim() || (isGroup ? 'Group chat' : senderName);
  const groupAvatarUrl = isGroup ? notificationImageUrl(artwork.chatAvatarUrl) : undefined;
  const senderAvatarUrl = notificationImageUrl(artwork.senderAvatarUrl);
  const avatarUrl = groupAvatarUrl || senderAvatarUrl;
  const avatarType = groupAvatarUrl ? 'group' : avatarUrl ? 'sender' : undefined;

  return {
    title: senderName,
    body: event.content.trim().slice(0, 160) || 'Sent you an update',
    badge,
    collapseId: event.messageId,
    categoryId: MESSAGE_NOTIFICATION_CATEGORY,
    // Communication styling (sender, group name, avatar) is applied by the
    // iOS Notification Service Extension even when no artwork is available.
    mutableContent: true,
    threadId: `chat:${event.chatId}`,
    tag: `chat:${event.chatId}`,
    data: {
      version: 1,
      type: 'new_message',
      messageId: event.messageId,
      chatId: event.chatId,
      platform: event.platform,
      senderId: event.senderContactId || `${event.platform}:${senderName}`,
      senderName,
      chatName,
      ...(!isGroup ? { contactName: senderName } : {}),
      isGroup,
      ...(avatarUrl ? { avatarUrl, avatarType: avatarType! } : {}),
      url: `claire://chat/${event.chatId}?messageId=${event.messageId}`,
    },
  };
}

export function shouldNotifyLoops(notificationEnabled: boolean | null | undefined, options: NotificationOptions): boolean {
  return notificationEnabled !== false && options.notify_loops !== false;
}

export function shouldNotifyConversation(notificationEnabled: boolean | null | undefined, options: NotificationOptions, isMuted: boolean | null | undefined): boolean {
  return notificationEnabled !== false && options.notify_messages !== false && isMuted !== true;
}

export function shouldDeliverLoopRevision(
  expected: { revision: number; userId: string },
  current: { reminder_revision: number; user_id: string; status: string } | null | undefined,
): boolean {
  return Boolean(
    current
    && current.reminder_revision === expected.revision
    && current.user_id === expected.userId
    && ['open', 'waiting', 'snoozed'].includes(current.status),
  );
}

function minutesAtTimezone(date: Date, timezone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
    const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0);
    const minute = Number(parts.find((part) => part.type === 'minute')?.value || 0);
    return hour * 60 + minute;
  } catch {
    return date.getUTCHours() * 60 + date.getUTCMinutes();
  }
}

function parseTime(value: string | undefined, fallback: number): number {
  const match = value?.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallback;
  return Math.min(23, Number(match[1])) * 60 + Math.min(59, Number(match[2]));
}

export function isInQuietHours(options: NotificationOptions, timezone: string, now = new Date()): boolean {
  if (!options.quiet_hours_enabled) return false;
  const start = parseTime(options.quiet_hours_start, 22 * 60);
  const end = parseTime(options.quiet_hours_end, 8 * 60);
  const current = minutesAtTimezone(now, timezone);
  if (start === end) return true;
  return start < end ? current >= start && current < end : current >= start || current < end;
}

/** Milliseconds until the current quiet window ends for this device. */
export function quietHoursDelay(options: NotificationOptions, timezone: string, now = new Date()): number {
  if (!isInQuietHours(options, timezone, now)) return 0;
  // Quiet-hour windows are at most 24h. Advancing minute-by-minute keeps the
  // calculation DST-safe and runs only when a notification is already due.
  const minute = 60_000;
  for (let elapsed = minute; elapsed <= 24 * 60 * minute; elapsed += minute) {
    if (!isInQuietHours(options, timezone, new Date(now.getTime() + elapsed))) return elapsed;
  }
  return 24 * 60 * minute;
}

export class NotificationDeliveryService {
  private queue?: Queue<NotificationJob>;
  private recoveryTimer?: ReturnType<typeof setInterval>;
  private recovering?: Promise<void>;

  async stop(): Promise<void> {
    if (this.recoveryTimer) clearInterval(this.recoveryTimer);
    this.recoveryTimer = undefined;
    await this.recovering;
    await this.queue?.close();
    this.queue = undefined;
  }

  /** Persisted payloads survive process exits, Redis loss and failed enqueue. */
  async recoverLoopOutbox(): Promise<void> {
    const { data, error } = await supabase.from('notification_deliveries')
      .select('id').eq('state', 'queued').not('outbox_payload', 'is', null)
      .lte('next_attempt_at', new Date().toISOString()).order('next_attempt_at').limit(50);
    if (error) throw error;
    for (const row of data ?? []) {
      try { await this.deliverLoopOutbox(row.id); }
      catch (error) { logger.warn('[push] loop outbox attempt failed', { deliveryId: row.id, error: error instanceof Error ? error.message : String(error) }); }
    }
    // Recover the second commit gap too: provider accepted, receipt job absent.
    const { data: receipts, error: receiptError } = await supabase.from('notification_deliveries')
      .select('id,device_id,provider_receipt_id,user_id,loop_id,digest_id').eq('state', 'submitted')
      .not('outbox_payload', 'is', null).not('provider_receipt_id', 'is', null)
      .lte('submitted_at', new Date(Date.now() - 15 * 60_000).toISOString()).limit(50);
    if (receiptError) throw receiptError;
    for (const row of receipts ?? []) await this.queue!.add({ kind: 'receipt', deliveryId: row.id,
      deviceId: row.device_id, receiptId: row.provider_receipt_id,
      telemetry: { userId: row.user_id, platform: 'claire', traceSource: row.loop_id || row.digest_id },
    }, { jobId: `receipt:${row.provider_receipt_id}`, removeOnComplete: true, removeOnFail: true });
  }

  private async deliverLoopOutbox(deliveryId: string): Promise<void> {
    if (process.env.LOOP_NOTIFICATIONS_ENABLED === 'false') return;
    const { data: claimed, error } = await supabase.rpc('claim_loop_delivery', { p_id: deliveryId });
    if (error) throw error;
    const row = claimed?.[0];
    if (!row) return;
    const finish = async (patch: Record<string, unknown>) => {
      const { error } = await supabase.from('notification_deliveries').update({ ...patch,
        lease_token: null, lease_until: null, updated_at: new Date().toISOString(),
      }).eq('id', deliveryId).eq('lease_token', row.lease_token);
      if (error) throw error;
    };
    try {
      const [deviceResult, prefsResult, loopResult] = await Promise.all([
        supabase.from('notification_devices').select('*').eq('id', row.device_id).eq('user_id', row.user_id).maybeSingle(),
        supabase.from('user_preferences').select('notification_enabled,preferences').eq('user_id', row.user_id).maybeSingle(),
        row.loop_id ? supabase.from('loops').select('user_id,status,visibility,reminder_revision,snoozed_until,reminder_reason,reminder_sent_at,title,content').eq('id', row.loop_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      ]);
      for (const result of [deviceResult, prefsResult, loopResult]) if (result.error) throw result.error;
      const device = deviceResult.data as NotificationDevice | null;
      let loop = loopResult.data;
      let payload = row.outbox_payload as NotificationPayload;
      const isCreation = row.notification_type === 'loop_created';
      if (isCreation && loop) {
        // A title/deadline edit must not cancel the creation alert or leave it
        // displaying stale copy while deferred by quiet hours.
        payload = { ...payload, body: (loop.title?.trim() || loop.content || '').slice(0, 180) };
      }
      if (row.digest_id) {
        const { data: items, error } = await supabase.from('loop_digest_items')
          .select('revision,loop:loops(id,user_id,status,visibility,reminder_revision,snoozed_until,title,content)')
          .eq('digest_id', row.digest_id).eq('user_id', row.user_id);
        if (error) throw error;
        const current = (items ?? []).filter((item: any) => item.loop && shouldDeliverLoopRevision({ userId: row.user_id, revision: item.revision }, item.loop)
          && item.loop.visibility === 'surfaced' && (!item.loop.snoozed_until || Date.parse(item.loop.snoozed_until) <= Date.now())) as unknown as Array<{ loop: any }>;
        loop = current[0]?.loop ?? null;
        // A digest has no complete/snooze category: a lock-screen action must
        // never accidentally close all of its obligations.
        payload = { title: 'Your follow-ups', body: current.map((item: any) => item.loop.title || item.loop.content).join(' • ').slice(0, 240),
          collapseId: `digest:${row.digest_id}`, channelId: 'loops', threadId: 'loops',
          data: { type: 'loop_digest', digestId: row.digest_id, url: 'claire://loops' } };
      }
      const options = (prefsResult.data?.preferences ?? {}) as NotificationOptions;
      const eligible = isCreation
        ? loop?.user_id === row.user_id && ['open', 'waiting'].includes(loop.status)
        : row.digest_id ? !!loop : shouldDeliverLoopRevision({ userId: row.user_id, revision: row.subject_revision }, loop);
      if (process.env.LOOP_NOTIFICATIONS_ENABLED === 'false' || !device?.enabled || !shouldNotifyLoops(prefsResult.data?.notification_enabled, options) ||
          !eligible || loop?.visibility !== 'surfaced') {
        await finish({ state: 'suppressed', error_code: !device?.enabled ? 'device_disabled' : 'policy_changed' });
        return;
      }
      let delay = quietHoursDelay(options, device.timezone);
      if (loop.snoozed_until) delay = Math.max(delay, new Date(loop.snoozed_until).getTime() - Date.now());
      if (delay > 0) {
        await finish({ next_attempt_at: new Date(Date.now() + delay).toISOString(), error_code: 'quiet_or_snoozed' });
        return;
      }
      // Creation confirmations are immediate events, not proactive follow-ups;
      // they neither consume the reminder budget nor acknowledge its schedule.
      if (!isCreation && loop.reminder_reason !== 'snooze_ended') {
        const { data: reserved, error } = await supabase.rpc('reserve_loop_notification', {
          p_user_id: row.user_id, p_episode: row.digest_id ? `digest:${row.digest_id}` : `${row.loop_id}:${row.subject_revision}`, p_timezone: device.timezone || 'UTC',
        });
        if (error) throw error;
        if (!reserved) {
          await finish({ next_attempt_at: new Date(Date.now() + 6 * 60 * 60_000).toISOString(), error_code: 'daily_budget' });
          return;
        }
      }
      const provider = device.provider === 'expo' ? expoNotificationProvider : device.provider === 'apns' ? apnsNotificationProvider : null;
      const result = provider ? await provider.send(device.token, payload)
        : { state: 'failed' as const, errorCode: 'unsupported_provider' };
      const now = new Date().toISOString();
      const retry = result.retryable && row.attempts < 12;
      await finish({ state: retry ? 'queued' : result.state,
        next_attempt_at: new Date(Date.now() + Math.min(6 * 60 * 60_000, 30_000 * 2 ** Math.min(row.attempts, 10))).toISOString(),
        error_code: result.errorCode ?? null, error_message: result.errorMessage ?? null,
        provider_ticket_id: result.ticketId ?? null, provider_receipt_id: result.receiptId ?? null,
        ...(result.state === 'submitted' ? { submitted_at: now } : {}),
        ...(result.state === 'delivered' ? { delivered_at: now } : {}),
        ...(result.state === 'failed' && !retry ? { failed_at: now } : {}),
      });
      if (result.invalidToken) {
        const { error } = await supabase.from('notification_devices').update({ enabled: false }).eq('id', device.id);
        if (error) throw error;
      }
      if (!isCreation && (result.state === 'submitted' || result.state === 'delivered')) {
        const { error } = row.digest_id
          ? await supabase.rpc('accept_loop_digest', { p_digest_id: row.digest_id, p_user_id: row.user_id })
          : await supabase.rpc('accept_loop_reminder', { p_loop_id: row.loop_id, p_user_id: row.user_id, p_revision: row.subject_revision });
        if (error) throw error;
      }
    } catch (error) {
      // A transport timeout may mean the provider accepted the push. Stable
      // collapse ids reduce duplicate presentation; they cannot guarantee it.
      await finish({ state: row.attempts >= 12 ? 'failed' : 'queued', next_attempt_at: new Date(Date.now() + 60_000).toISOString(), error_code: 'attempt_failed' });
      throw error;
    }
  }

  start(): void {
    if (this.queue) return;
    const defaultJobOptions = { attempts: 4, backoff: { type: 'exponential' as const, delay: 2_000 }, removeOnComplete: 500, removeOnFail: 500 };
    this.queue = 'url' in redisConfig
      ? new Bull<NotificationJob>('notification-delivery', redisConfig.url!, { defaultJobOptions })
      : new Bull<NotificationJob>('notification-delivery', {
          redis: { host: redisConfig.host, port: redisConfig.port, password: redisConfig.password },
          defaultJobOptions,
        });
    this.queue.process(10, (job) => this.process(job));
    this.queue.on('failed', (job, error) => logger.error(`Notification job ${job.id} failed`, error));
    const recover = () => {
      if (this.recovering) return;
      this.recovering = this.recoverLoopOutbox().catch(error => { logger.error('[push] outbox recovery failed', error); }).finally(() => { this.recovering = undefined; });
    };
    this.recoveryTimer = setInterval(recover, 15_000);
    recover();
  }

  async enqueueIncomingMessage(event: IncomingNotificationEvent): Promise<number> {
    // Keep the delivery boundary defensive: status posts must remain silent
    // even if a future ingestion path bypasses the primary message filter.
    if (isWhatsAppStatusUpdate({
      platform: event.platform,
      chatId: event.chatId,
      chatName: event.chatName,
    })) return 0;

    this.start();
    const senderContact = event.senderContactId
      ? supabase.from('contacts').select('avatar_url').eq('id', event.senderContactId).eq('user_id', event.userId).maybeSingle()
      : Promise.resolve({ data: null, error: null });
    const [{ data: preferences, error: preferenceError }, { data: devices, error: deviceError }, { data: chat, error: chatError }, { data: contactRow, error: contactError }] = await Promise.all([
      supabase.from('user_preferences').select('notification_enabled,preferences').eq('user_id', event.userId).maybeSingle(),
      supabase.from('notification_devices').select('id,user_id,device_id,platform,provider,token,enabled,timezone').eq('user_id', event.userId).eq('enabled', true),
      supabase.from('chats').select('is_muted,avatar_url,contact:contacts!chats_contact_id_fkey(avatar_url)').eq('id', event.chatId).eq('user_id', event.userId).maybeSingle(),
      senderContact,
    ]);
    if (preferenceError) throw preferenceError;
    if (deviceError) throw deviceError;
    if (chatError) throw chatError;
    if (contactError) throw contactError;
    const options = (preferences?.preferences || {}) as NotificationOptions;
    // The activity feed is account-level and survives unavailable/disabled push
    // devices. A muted chat, however, should not create an alert in either place.
    if (chat?.is_muted) return 0;
    const contact = Array.isArray(chat?.contact) ? chat.contact[0] : chat?.contact;
    const senderAvatarUrl = notificationImageUrl(contactRow?.avatar_url || contact?.avatar_url);
    const chatAvatarUrl = notificationImageUrl(chat?.avatar_url);
    try {
      await recordMessageActivity(event, { senderAvatarUrl, chatAvatarUrl });
    } catch (error) {
      // An activity-feed outage must not prevent normal message push delivery.
      logger.error('[notifications] could not record incoming activity', error);
    }
    if (!shouldNotifyConversation(preferences?.notification_enabled, options, chat?.is_muted)) return 0;

    const { data: chats } = await supabase.from('chats').select('unread_count').eq('user_id', event.userId);
    const badge = (chats || []).reduce((sum: number, chat: { unread_count?: number }) => sum + Math.max(0, chat.unread_count || 0), 0);
    let queued = 0;
    for (const device of (devices || []) as NotificationDevice[]) {
      let suppression: string | null = null;
      if (isInQuietHours(options, device.timezone)) suppression = 'quiet_hours';
      else if (await notificationPresence.isViewingChat(event.userId, device.device_id, event.chatId)) suppression = 'active_chat';

      const { data: delivery, error } = await supabase.from('notification_deliveries').upsert({
        user_id: event.userId,
        device_id: device.id,
        message_id: event.messageId,
        notification_type: 'new_message',
        state: suppression ? 'suppressed' : 'queued',
        error_code: suppression,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'message_id,device_id,notification_type', ignoreDuplicates: true }).select('id').maybeSingle();
      if (error) throw error;
      if (suppression || !delivery) continue;

      const payload = buildIncomingMessageNotification(event, badge, {
        senderAvatarUrl,
        chatAvatarUrl,
      });
      await this.queue!.add({
        kind: 'delivery',
        deliveryId: delivery.id,
        device,
        payload,
        telemetry: { userId: event.userId, platform: event.platform, traceSource: event.messageId },
      }, { jobId: `message:${event.messageId}:device:${device.id}` });
      void operationsTelemetry.record({
        traceSource: event.messageId,
        userId: event.userId,
        platform: event.platform,
        direction: 'inbound',
        stage: 'push',
        outcome: 'accepted',
      });
      queued += 1;
    }
    return queued;
  }

  /**
   * Put one loop revision onto the same reliable per-device path as messages.
   * A revision is the dedupe boundary: editing the deadline or ownership may
   * legitimately produce a new reminder, while repeated scheduler polls may not.
   */
  async enqueueLoopReminder(event: LoopReminderNotificationEvent): Promise<NotificationEnqueueResult> {
    if (process.env.LOOP_NOTIFICATIONS_ENABLED === 'false') return { queued: 0, outcome: 'disabled' };
    this.start();
    // A due follow-up should remain visible inside Claire even when push is
    // switched off or this account has no registered device.
    try {
      await recordLoopActivity(event);
    } catch (error) {
      logger.error('[notifications] could not record follow-up activity', error);
    }
    const [{ data: preferences, error: preferenceError }, { data: devices, error: deviceError }] = await Promise.all([
      supabase.from('user_preferences').select('notification_enabled,preferences').eq('user_id', event.userId).maybeSingle(),
      supabase.from('notification_devices').select('id,user_id,device_id,platform,provider,token,enabled,timezone').eq('user_id', event.userId).eq('enabled', true),
    ]);
    if (preferenceError) throw preferenceError;
    if (deviceError) throw deviceError;
    const options = (preferences?.preferences || {}) as NotificationOptions;
    if (!shouldNotifyLoops(preferences?.notification_enabled, options)) return { queued: 0, outcome: 'disabled' };
    if (!devices?.length) return { queued: 0, outcome: 'no_devices' };

    let queued = 0;
    const now = new Date();
    for (const device of devices as NotificationDevice[]) {
      const delay = quietHoursDelay(options, device.timezone, now);
      const payload: NotificationPayload = {
        title: event.title,
        body: event.body.trim().slice(0, 180),
        collapseId: `loop:${event.loopId}:${event.revision}`,
        channelId: 'loops',
        categoryId: LOOP_NOTIFICATION_CATEGORY,
        threadId: 'loops',
        tag: `loop:${event.loopId}`,
        data: {
          version: 1,
          type: 'loop_reminder',
          loopId: event.loopId,
          reason: event.reason,
          url: `claire://loops/${event.loopId}`,
        },
      };
      const { error } = await supabase.from('notification_deliveries').upsert({
        user_id: event.userId, device_id: device.id, loop_id: event.loopId,
        notification_type: 'loop_reminder', subject_revision: event.revision,
        state: 'queued', outbox_payload: payload,
        next_attempt_at: new Date(now.getTime() + delay).toISOString(), updated_at: now.toISOString(),
      }, { onConflict: 'loop_id,device_id,notification_type,subject_revision', ignoreDuplicates: true });
      if (error) throw error;
      queued += 1;
    }
    return { queued, outcome: 'queued' };
  }

  private async process(job: Job<NotificationJob>): Promise<void> {
    if (job.data.kind === 'receipt') return this.processReceipt(job.data);
    const { deliveryId, device, payload, telemetry, loop } = job.data;
    if (loop) {
      // Upgrade queued jobs from the previous release into the durable path.
      // Never let a retained legacy job bypass current budgets or preferences.
      const { error } = await supabase.from('notification_deliveries').update({
        outbox_payload: payload, next_attempt_at: new Date().toISOString(),
      }).eq('id', deliveryId).eq('state', 'queued').is('outbox_payload', null);
      if (error) throw error;
      return;
    }
    const provider = device.provider === 'expo' ? expoNotificationProvider : device.provider === 'apns' ? apnsNotificationProvider : null;
    if (!provider) {
      await this.recordResult(deliveryId, device.id, { state: 'failed', errorCode: 'unsupported_provider' }, job.attemptsMade + 1, telemetry);
      return;
    }
    const result = await provider.send(device.token, payload);
    await this.recordResult(deliveryId, device.id, result, job.attemptsMade + 1, telemetry);
    if (result.state === 'submitted' && result.receiptId && device.provider === 'expo') {
      await this.queue!.add({ kind: 'receipt', deliveryId, deviceId: device.id, receiptId: result.receiptId, telemetry }, { delay: 15 * 60_000, attempts: 4, backoff: { type: 'exponential', delay: 60_000 }, jobId: `receipt:${result.receiptId}` });
    }
    if (result.retryable) throw new Error(result.errorCode || 'Transient notification provider failure');
  }

  private async processReceipt(job: ReceiptJob): Promise<void> {
    const result = await expoNotificationProvider.getReceipt(job.receiptId);
    await this.recordResult(job.deliveryId, job.deviceId, result, undefined, job.telemetry);
    if (result.state === 'submitted' || result.retryable) throw new Error(result.errorCode || 'Expo receipt is not ready');
  }

  private async recordResult(deliveryId: string, deviceId: string, result: ProviderResult, attempts?: number, telemetry?: DeliveryJob['telemetry']): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await supabase.from('notification_deliveries').update({
      state: result.state,
      ...(attempts !== undefined ? { attempts } : {}),
      provider_ticket_id: result.ticketId ?? undefined,
      provider_receipt_id: result.receiptId ?? undefined,
      error_code: result.errorCode ?? null,
      error_message: result.errorMessage ?? null,
      ...(result.state === 'submitted' ? { submitted_at: now } : {}),
      ...(result.state === 'delivered' ? { delivered_at: now } : {}),
      ...(result.state === 'failed' ? { failed_at: now } : {}),
      updated_at: now,
    }).eq('id', deliveryId);
    if (error) throw error;
    if (telemetry) {
      void operationsTelemetry.record({
        traceSource: telemetry.traceSource,
        userId: telemetry.userId,
        platform: telemetry.platform,
        direction: 'inbound',
        stage: 'push',
        outcome: result.state === 'failed' ? 'failed' : result.state === 'delivered' ? 'acknowledged' : 'published',
        retryCount: attempts ? Math.max(0, attempts - 1) : 0,
        errorClass: result.state === 'failed' ? 'provider' : undefined,
      });
    }
    if (result.invalidToken) await supabase.from('notification_devices').update({ enabled: false, updated_at: now }).eq('id', deviceId);
  }
}

export const notificationDeliveryService = new NotificationDeliveryService();
