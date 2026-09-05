import { describe, expect, it } from 'bun:test';
import { isInQuietHours, shouldNotifyConversation } from './notification-delivery';
import { ExpoNotificationProvider } from './notification-providers';

describe('notification eligibility', () => {
  it('blocks a muted conversation while leaving unmuted conversations eligible', () => {
    expect(shouldNotifyConversation(true, { notify_messages: true }, true)).toBe(false);
    expect(shouldNotifyConversation(true, { notify_messages: true }, false)).toBe(true);
    expect(shouldNotifyConversation(true, { notify_messages: true }, null)).toBe(true);
  });

  it('handles quiet hours that cross midnight in the device timezone', () => {
    const options = { quiet_hours_enabled: true, quiet_hours_start: '22:00', quiet_hours_end: '08:00' };
    expect(isInQuietHours(options, 'UTC', new Date('2026-08-15T23:00:00Z'))).toBe(true);
    expect(isInQuietHours(options, 'UTC', new Date('2026-08-15T07:59:00Z'))).toBe(true);
    expect(isInQuietHours(options, 'UTC', new Date('2026-08-15T12:00:00Z'))).toBe(false);
  });

  it('uses the device timezone rather than server local time', () => {
    const options = { quiet_hours_enabled: true, quiet_hours_start: '22:00', quiet_hours_end: '08:00' };
    const instant = new Date('2026-08-15T04:30:00Z');
    expect(isInQuietHours(options, 'America/Mexico_City', instant)).toBe(true);
    expect(isInQuietHours(options, 'Europe/London', instant)).toBe(true);
  });
});
describe('ExpoNotificationProvider', () => {
  it('submits the stable cross-platform payload and returns the receipt id', async () => {
    const originalFetch = global.fetch;
    let sent: Record<string, unknown> = {};
    global.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ data: { status: 'ok', id: 'receipt-1' } }) } as Response;
    }) as typeof fetch;
    try {
      const result = await new ExpoNotificationProvider().send('ExpoPushToken[test]', {
        title: 'Ada', body: 'Hello', badge: 3, collapseId: 'message-1',
        data: { version: 1, type: 'new_message', chatId: 'chat-1', messageId: 'message-1', platform: 'whatsapp', url: 'claire://chat/chat-1?messageId=message-1' },
      });
      expect(result).toEqual({ state: 'submitted', ticketId: 'receipt-1', receiptId: 'receipt-1' });
      expect(sent.collapseId).toBe('message-1');
      expect(sent.channelId).toBe('messages');
      expect((sent.data as Record<string, unknown>).url).toContain('claire://chat/chat-1');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('marks DeviceNotRegistered as an invalid token', async () => {
    const originalFetch = global.fetch;
    global.fetch = (async () => ({ ok: true, json: async () => ({ data: { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } } }) }) as Response) as typeof fetch;
    try {
      const result = await new ExpoNotificationProvider().send('ExpoPushToken[gone]', { title: 'x', body: 'y', collapseId: 'm', data: {} });
      expect(result.invalidToken).toBe(true);
      expect(result.retryable).toBe(false);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
