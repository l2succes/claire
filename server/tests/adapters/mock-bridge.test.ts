/**
 * Unit tests for MockBridgeAdapter and mock-fixtures
 *
 * These run without any env vars, Docker, or real network access.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { MockBridgeAdapter } from '../../src/adapters/mock';
import {
  MOCK_USER_ID,
  MOCK_SESSION_ID,
  MOCK_MESSAGES,
  MOCK_CHATS,
  MOCK_CONTACTS,
  MOCK_CHAT_IDS,
  PROMISE_MESSAGE_TEXT,
  FIXTURE_SUMMARY,
} from '../../src/mock-fixtures';
import { Platform, PlatformStatus, MessageContentType } from '../../src/adapters/types';

describe('mock-fixtures', () => {
  it('has a stable user ID', () => {
    expect(MOCK_USER_ID).toBe('00000000-0000-0000-0000-000000000001');
  });

  it('has 3 platforms in fixture summary', () => {
    expect(FIXTURE_SUMMARY.platforms).toHaveLength(3);
    expect(FIXTURE_SUMMARY.platforms).toContain('whatsapp');
    expect(FIXTURE_SUMMARY.platforms).toContain('telegram');
    expect(FIXTURE_SUMMARY.platforms).toContain('instagram');
  });

  it('has exactly 10 messages', () => {
    expect(MOCK_MESSAGES).toHaveLength(10);
    expect(FIXTURE_SUMMARY.messageCount).toBe(10);
  });

  it('has exactly 4 chats (3 individual + 1 group)', () => {
    expect(MOCK_CHATS).toHaveLength(4);
    expect(FIXTURE_SUMMARY.chatCount).toBe(4);
    const groups = MOCK_CHATS.filter((c) => c.isGroup);
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe('Team Chat');
  });

  it('has exactly 3 contacts', () => {
    expect(MOCK_CONTACTS).toHaveLength(3);
  });

  it('has a promise-bearing message containing "Friday"', () => {
    expect(PROMISE_MESSAGE_TEXT).toContain('Friday');
    const promiseMsg = MOCK_MESSAGES.find(
      (m) => m.platformMessageId === FIXTURE_SUMMARY.promiseMessageId
    );
    expect(promiseMsg).toBeDefined();
    expect(promiseMsg!.content).toBe(PROMISE_MESSAGE_TEXT);
    expect(promiseMsg!.isFromMe).toBe(true);
  });

  it('has messages on all 3 platforms', () => {
    const platforms = new Set(MOCK_MESSAGES.map((m) => m.platform));
    expect(platforms.has(Platform.WHATSAPP)).toBe(true);
    expect(platforms.has(Platform.TELEGRAM)).toBe(true);
    expect(platforms.has(Platform.INSTAGRAM)).toBe(true);
  });

  it('all messages reference valid chat IDs', () => {
    const chatIds = new Set(Object.values(MOCK_CHAT_IDS));
    for (const msg of MOCK_MESSAGES) {
      expect(chatIds.has(msg.chatId as any)).toBe(true);
    }
  });

  it('all messages have userId set to MOCK_USER_ID', () => {
    for (const msg of MOCK_MESSAGES) {
      expect(msg.userId).toBe(MOCK_USER_ID);
    }
  });
});

describe('MockBridgeAdapter', () => {
  let adapter: MockBridgeAdapter;

  beforeEach(() => {
    adapter = new MockBridgeAdapter();
  });

  it('has CONNECTED status session', async () => {
    const session = await adapter.getSession(MOCK_SESSION_ID);
    expect(session).not.toBeNull();
    expect(session!.status).toBe(PlatformStatus.CONNECTED);
  });

  it('returns null for unknown session', async () => {
    const session = await adapter.getSession('unknown-session-999');
    expect(session).toBeNull();
  });

  it('returns sessions for mock user', async () => {
    const sessions = await adapter.getUserSessions(MOCK_USER_ID);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe(MOCK_SESSION_ID);
  });

  it('returns empty sessions for unknown user', async () => {
    const sessions = await adapter.getUserSessions('unknown-user-999');
    expect(sessions).toHaveLength(0);
  });

  it('returns contacts', async () => {
    const contacts = await adapter.getContacts(MOCK_SESSION_ID);
    expect(contacts).toHaveLength(3);
  });

  it('returns chats', async () => {
    const chats = await adapter.getChats(MOCK_SESSION_ID);
    expect(chats).toHaveLength(4);
  });

  it('returns chat history filtered by chatId', async () => {
    const history = await adapter.getChatHistory(
      MOCK_SESSION_ID,
      MOCK_CHAT_IDS.whatsapp_alice
    );
    expect(history.length).toBeGreaterThan(0);
    for (const msg of history) {
      expect(msg.chatId).toBe(MOCK_CHAT_IDS.whatsapp_alice);
    }
  });

  it('emits message events on initialize', async () => {
    const received: unknown[] = [];
    adapter.on('message', (data) => received.push(data));

    await adapter.initialize();

    // setImmediate fires after current turn; wait for it
    await new Promise((resolve) => setImmediate(resolve));

    expect(received.length).toBe(MOCK_MESSAGES.length);
  });

  it('sendMessage records sent message', async () => {
    const sent = await adapter.sendMessage(MOCK_SESSION_ID, MOCK_CHAT_IDS.whatsapp_alice, {
      content: 'Hello from test',
      contentType: MessageContentType.TEXT,
    });
    expect(sent.content).toBe('Hello from test');
    expect(sent.isFromMe).toBe(true);
    expect(adapter.getSentMessages()).toHaveLength(1);
  });

  it('shutdown removes all listeners', async () => {
    const handler = () => {};
    adapter.on('message', handler);
    expect(adapter.listenerCount('message')).toBe(1);
    await adapter.shutdown();
    expect(adapter.listenerCount('message')).toBe(0);
  });
});
