import Bull, { Job, Queue } from 'bull';
import { redisConfig } from '../config';
import { supabase } from './supabase';
import { notificationPresence } from './notification-presence';
import { apnsNotificationProvider, expoNotificationProvider, type NotificationPayload, type ProviderResult } from './notification-providers';
import { logger } from '../utils/logger';
import { operationsTelemetry } from './operations-telemetry';

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
  senderName?: string;
  content: string;
  messageId: string;
}

interface DeliveryJob {
  kind: 'delivery';
  deliveryId: string;
  device: NotificationDevice;
  payload: NotificationPayload;
  telemetry: { userId: string; platform: string; traceSource: string };
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
  quiet_hours_enabled?: boolean;
  quiet_hours_start?: string;
  quiet_hours_end?: string;
}

export function shouldNotifyConversation(notificationEnabled: boolean | null | undefined, options: NotificationOptions, isMuted: boolean | null | undefined): boolean {
  return notificationEnabled !== false && options.notify_messages !== false && isMuted !== true;
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
    this.start();
    const [{ data: preferences, error: preferenceError }, { data: devices, error: deviceError }, { data: chat, error: chatError }] = await Promise.all([
      supabase.from('user_preferences').select('notification_enabled,preferences').eq('user_id', event.userId).maybeSingle(),
      supabase.from('notification_devices').select('id,user_id,device_id,platform,provider,token,enabled,timezone').eq('user_id', event.userId).eq('enabled', true),
      supabase.from('chats').select('is_muted').eq('id', event.chatId).eq('user_id', event.userId).maybeSingle(),
    ]);
    if (preferenceError) throw preferenceError;
    if (deviceError) throw deviceError;
    if (chatError) throw chatError;
    const options = (preferences?.preferences || {}) as NotificationOptions;
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

      const payload: NotificationPayload = {
        title: event.senderName || 'New message',
        body: event.content.trim().slice(0, 160) || 'Sent you an update',
        badge,
        collapseId: event.messageId,
        data: {
          version: 1,
          type: 'new_message',
          messageId: event.messageId,
          chatId: event.chatId,
          platform: event.platform,
          url: `claire://chat/${event.chatId}?messageId=${event.messageId}`,
        },
      };
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

  private async process(job: Job<NotificationJob>): Promise<void> {
    if (job.data.kind === 'receipt') return this.processReceipt(job.data);
    const { deliveryId, device, payload, telemetry } = job.data;
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
