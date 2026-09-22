import Bull, { Job, Queue } from 'bull';
import { redisConfig } from '../config';
import { supabase } from './supabase';
import { notificationPresence } from './notification-presence';
import { apnsNotificationProvider, expoNotificationProvider, type NotificationPayload, type ProviderResult } from './notification-providers';
import { logger } from '../utils/logger';
import { operationsTelemetry } from './operations-telemetry';
import { isWhatsAppStatusUpdate } from './whatsapp-status';

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
    if (!shouldNotifyConversation(preferences?.notification_enabled, options, chat?.is_muted)) return 0;

    const { data: chats } = await supabase.from('chats').select('unread_count').eq('user_id', event.userId);
    const badge = (chats || []).reduce((sum: number, chat: { unread_count?: number }) => sum + Math.max(0, chat.unread_count || 0), 0);
    const contact = Array.isArray(chat?.contact) ? chat.contact[0] : chat?.contact;
    const senderAvatarUrl = notificationImageUrl(contactRow?.avatar_url || contact?.avatar_url);
    const chatAvatarUrl = notificationImageUrl(chat?.avatar_url);
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
    this.start();
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
      const { data: delivery, error } = await supabase.from('notification_deliveries').upsert({
        user_id: event.userId,
        device_id: device.id,
        loop_id: event.loopId,
        notification_type: 'loop_reminder',
        subject_revision: event.revision,
        state: 'queued',
        updated_at: now.toISOString(),
      }, {
        onConflict: 'loop_id,device_id,notification_type,subject_revision',
        ignoreDuplicates: true,
      }).select('id').maybeSingle();
      if (error) throw error;
      // An empty row with no error means this revision/device already has a
      // durable delivery record. Count it as accepted; its original queue job
      // owns retries and must not be duplicated here.
      if (!delivery) {
        queued += 1;
        continue;
      }

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
      await this.queue!.add({
        kind: 'delivery',
        deliveryId: delivery.id,
        device,
        payload,
        telemetry: { userId: event.userId, platform: 'claire', traceSource: event.loopId },
        loop: { loopId: event.loopId, revision: event.revision, userId: event.userId },
      }, {
        jobId: `loop:${event.loopId}:revision:${event.revision}:device:${device.id}`,
        ...(delay ? { delay } : {}),
      });
      queued += 1;
    }
    return { queued, outcome: 'queued' };
  }

  private async process(job: Job<NotificationJob>): Promise<void> {
    if (job.data.kind === 'receipt') return this.processReceipt(job.data);
    const { deliveryId, device, payload, telemetry, loop } = job.data;
    if (loop) {
      const { data: currentLoop, error } = await supabase
        .from('loops')
        .select('user_id,status,reminder_revision')
        .eq('id', loop.loopId)
        .maybeSingle();
      if (error) throw error;
      if (!shouldDeliverLoopRevision(loop, currentLoop)) {
        await supabase.from('notification_deliveries').update({
          state: 'suppressed',
          error_code: 'stale_loop_revision',
          updated_at: new Date().toISOString(),
        }).eq('id', deliveryId);
        return;
      }
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
    await supabase.from('notification_deliveries').update({
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
