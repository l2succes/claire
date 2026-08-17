import { describe, expect, test } from 'bun:test';
import { PlatformManager, MessageContentType, Platform, type UnifiedMessage } from './index';

function companionMessage(): UnifiedMessage {
  return {
    id: 'companion-imessage:guid-1',
    platformMessageId: 'guid-1',
    platform: Platform.IMESSAGE,
    sessionId: 'companion:device-1',
    userId: 'user-1',
    content: 'on my way',
    contentType: MessageContentType.TEXT,
    senderId: 'me',
    chatId: 'chat-1',
    chatType: 'individual',
    timestamp: new Date('2026-08-14T12:00:00.000Z'),
    isFromMe: true,
    isRead: true,
    hasMedia: false,
    platformMetadata: { source: 'mac_companion' },
  };
}

describe('PlatformManager companion ingestion', () => {
  test('routes a device-originated message through unified subscribers', async () => {
    const manager = new PlatformManager();
    const received: UnifiedMessage[] = [];
    manager.onMessage(async (message) => { received.push(message); });

    await manager.ingestMessage(companionMessage());

    expect(received).toHaveLength(1);
    expect(received[0].platform).toBe(Platform.IMESSAGE);
    expect(received[0].userId).toBe('user-1');
    expect(received[0].platformMetadata?.source).toBe('mac_companion');
  });
});
