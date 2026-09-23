import { describe, expect, it } from 'bun:test';
import { buildIncomingMessageNotification, NotificationDeliveryService, isInQuietHours, notificationImageUrl, quietHoursDelay, shouldDeliverLoopRevision, shouldNotifyConversation, shouldNotifyLoops } from './notification-delivery';
import { ExpoNotificationProvider } from './notification-providers';

describe('notification eligibility', () => {
  it('blocks a muted conversation while leaving unmuted conversations eligible', () => {
    expect(shouldNotifyConversation(true, { notify_messages: true }, true)).toBe(false);
    expect(shouldNotifyConversation(true, { notify_messages: true }, false)).toBe(true);
    expect(shouldNotifyConversation(true, { notify_messages: true }, null)).toBe(true);
  });

  it('honors the master and loop-specific switches', () => {
    expect(shouldNotifyLoops(true, { notify_loops: true })).toBe(true);
    expect(shouldNotifyLoops(false, { notify_loops: true })).toBe(false);
    expect(shouldNotifyLoops(true, { notify_loops: false })).toBe(false);
  });

  it('only allows public HTTPS avatar URLs in rich notifications', () => {
    expect(notificationImageUrl('https://cdn.example.com/avatar.jpg')).toBe('https://cdn.example.com/avatar.jpg');
    expect(notificationImageUrl('http://cdn.example.com/avatar.jpg')).toBeUndefined();
    expect(notificationImageUrl('file:///tmp/avatar.jpg')).toBeUndefined();
    expect(notificationImageUrl('not a url')).toBeUndefined();
  });

  it('keeps sender and group identity separate without an avatar', () => {
    const payload = buildIncomingMessageNotification({
      userId: 'user-1', chatId: 'chat-1', platform: 'whatsapp',
      senderContactId: 'contact-1', senderName: 'Jare CDMX',
      chatName: 'Melaninaires', isGroup: true,
      content: 'See you there', messageId: 'message-1',
    }, 4);

    expect(payload.title).toBe('Jare CDMX');
    expect(payload.mutableContent).toBe(true);
    expect(payload.data.senderName).toBe('Jare CDMX');
    expect(payload.data.chatName).toBe('Melaninaires');
    expect(payload.data.isGroup).toBe(true);
    expect(payload.data.avatarUrl).toBeUndefined();
  });

  it('uses group artwork for a group and sender artwork for a direct message', () => {
    const event = {
      userId: 'user-1', chatId: 'chat-1', platform: 'whatsapp',
      senderName: 'Ada', chatName: 'Design Team', isGroup: true,
      content: 'New mockups', messageId: 'message-1',
    };
    const group = buildIncomingMessageNotification(event, 1, {
      senderAvatarUrl: 'https://cdn.example.com/ada.jpg',
      chatAvatarUrl: 'https://cdn.example.com/design-team.jpg',
    });
    const direct = buildIncomingMessageNotification({ ...event, isGroup: false }, 1, {
      senderAvatarUrl: 'https://cdn.example.com/ada.jpg',
      chatAvatarUrl: 'https://cdn.example.com/ignored.jpg',
    });

    expect(group.data.avatarUrl).toBe('https://cdn.example.com/design-team.jpg');
    expect(group.data.avatarType).toBe('group');
    expect(direct.data.avatarUrl).toBe('https://cdn.example.com/ada.jpg');
    expect(direct.data.avatarType).toBe('sender');
  });

  it('drops loop deliveries after completion or a semantic edit', () => {
    const expected = { revision: 3, userId: 'user-1' };
    expect(shouldDeliverLoopRevision(expected, { reminder_revision: 3, user_id: 'user-1', status: 'open' })).toBe(true);
    expect(shouldDeliverLoopRevision(expected, { reminder_revision: 4, user_id: 'user-1', status: 'open' })).toBe(false);
    expect(shouldDeliverLoopRevision(expected, { reminder_revision: 3, user_id: 'user-1', status: 'done' })).toBe(false);
  });

  it('drops a WhatsApp Status room before starting delivery work', async () => {
    const queued = await new NotificationDeliveryService().enqueueIncomingMessage({
      userId: 'user-1',
      chatId: '!status-room:claire.local',
      platform: 'whatsapp',
      chatName: 'WhatsApp Status Broadcast',
      content: 'A new status post',
      messageId: 'message-1',
    });
    expect(queued).toBe(0);
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

  it('delays a due reminder until quiet hours end', () => {
    const options = { quiet_hours_enabled: true, quiet_hours_start: '22:00', quiet_hours_end: '08:00' };
    const delay = quietHoursDelay(options, 'UTC', new Date('2026-08-15T07:30:00Z'));
    expect(delay).toBe(30 * 60_000);
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

  it('forwards rich media, grouping, and action-category metadata', async () => {
    const originalFetch = global.fetch;
    let sent: Record<string, unknown> = {};
    global.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ data: { status: 'ok', id: 'receipt-rich' } }) } as Response;
    }) as typeof fetch;
    try {
      await new ExpoNotificationProvider().send('ExpoPushToken[test]', {
        title: 'Ada', body: 'Hello', collapseId: 'message-1',
        categoryId: 'claire_message', mutableContent: true, threadId: 'chat:chat-1', tag: 'chat:chat-1',
        richContent: { image: 'https://cdn.example.com/ada.jpg' },
        data: { type: 'new_message', chatId: 'chat-1', avatarUrl: 'https://cdn.example.com/ada.jpg' },
      });
      expect(sent.categoryId).toBe('claire_message');
      expect(sent.mutableContent).toBe(true);
      expect(sent.threadId).toBe('chat:chat-1');
      expect(sent.tag).toBe('chat:chat-1');
      expect(sent.richContent).toEqual({ image: 'https://cdn.example.com/ada.jpg' });
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('uses the loop notification channel when requested', async () => {
    const originalFetch = global.fetch;
    let sent: Record<string, unknown> = {};
    global.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ data: { status: 'ok', id: 'receipt-loop' } }) } as Response;
    }) as typeof fetch;
    try {
      await new ExpoNotificationProvider().send('ExpoPushToken[test]', {
        title: 'Coming up', body: 'Send the deck', collapseId: 'loop:1', channelId: 'loops',
        data: { version: 1, type: 'loop_reminder', loopId: 'loop-1', url: 'claire://loops/loop-1' },
      });
      expect(sent.channelId).toBe('loops');
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
