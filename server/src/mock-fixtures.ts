/**
 * Mock Bridge Fixtures
 *
 * Deterministic seeded data for MOCK_BRIDGE=true server mode.
 * No Docker, no real WhatsApp/Matrix/Telegram/Instagram required.
 *
 * Fixture inventory:
 *  - 1 mock user: uuid MOCK_USER_ID
 *  - 3 connected platforms: whatsapp, telegram, instagram
 *  - 3 chats (one per platform) + 1 group chat (whatsapp)
 *  - 10 messages across the chats
 *  - 1 promise-bearing message: "I'll send you the report by Friday"
 *  - 1 AI suggestion tied to the promise-bearing message
 */

import { Platform, MessageContentType, UnifiedMessage, UnifiedChat, UnifiedContact } from './adapters/types';

// ─── Deterministic IDs ─────────────────────────────────────────────────────

export const MOCK_USER_ID = '00000000-0000-0000-0000-000000000001';
export const MOCK_SESSION_ID = 'mock-session-001';

export const MOCK_CHAT_IDS = {
  whatsapp_alice: 'mock-chat-wa-alice',
  telegram_bob: 'mock-chat-tg-bob',
  instagram_carol: 'mock-chat-ig-carol',
  whatsapp_group: 'mock-chat-wa-group',
} as const;

export const MOCK_CONTACT_IDS = {
  alice: 'mock-contact-alice',
  bob: 'mock-contact-bob',
  carol: 'mock-contact-carol',
} as const;

export const MOCK_MESSAGE_IDS = {
  wa_alice_1: 'mock-msg-wa-alice-1',
  wa_alice_2: 'mock-msg-wa-alice-2',
  wa_alice_promise: 'mock-msg-wa-alice-promise',
  wa_alice_reply: 'mock-msg-wa-alice-reply',
  tg_bob_1: 'mock-msg-tg-bob-1',
  tg_bob_2: 'mock-msg-tg-bob-2',
  ig_carol_1: 'mock-msg-ig-carol-1',
  ig_carol_2: 'mock-msg-ig-carol-2',
  wa_group_1: 'mock-msg-wa-group-1',
  wa_group_2: 'mock-msg-wa-group-2',
} as const;

// The canonical promise message text — used in tests to assert detection
export const PROMISE_MESSAGE_TEXT = "I'll send you the report by Friday";

// ─── Base timestamp (deterministic — 2026-06-28T10:00:00Z) ─────────────────

const BASE_TS = new Date('2026-06-28T10:00:00Z');
const ts = (offsetMinutes: number) => new Date(BASE_TS.getTime() + offsetMinutes * 60_000);

// ─── Contacts ──────────────────────────────────────────────────────────────

export const MOCK_CONTACTS: UnifiedContact[] = [
  {
    id: MOCK_CONTACT_IDS.alice,
    platformContactId: '15551110001',
    platform: Platform.WHATSAPP,
    userId: MOCK_USER_ID,
    displayName: 'Alice (WA)',
    phoneNumber: '+15551110001',
    isBlocked: false,
    isVerified: false,
  },
  {
    id: MOCK_CONTACT_IDS.bob,
    platformContactId: '987654321',
    platform: Platform.TELEGRAM,
    userId: MOCK_USER_ID,
    displayName: 'Bob (TG)',
    username: '@bob_telegram',
    isBlocked: false,
    isVerified: false,
  },
  {
    id: MOCK_CONTACT_IDS.carol,
    platformContactId: 'carol.ig',
    platform: Platform.INSTAGRAM,
    userId: MOCK_USER_ID,
    displayName: 'Carol (IG)',
    username: 'carol.ig',
    isBlocked: false,
    isVerified: false,
  },
];

// ─── Chats ─────────────────────────────────────────────────────────────────

export const MOCK_CHATS: UnifiedChat[] = [
  {
    id: MOCK_CHAT_IDS.whatsapp_alice,
    platformChatId: MOCK_CHAT_IDS.whatsapp_alice,
    platform: Platform.WHATSAPP,
    userId: MOCK_USER_ID,
    name: 'Alice (WA)',
    isGroup: false,
    lastMessageAt: ts(4),
    unreadCount: 2,
  },
  {
    id: MOCK_CHAT_IDS.telegram_bob,
    platformChatId: MOCK_CHAT_IDS.telegram_bob,
    platform: Platform.TELEGRAM,
    userId: MOCK_USER_ID,
    name: 'Bob (TG)',
    isGroup: false,
    lastMessageAt: ts(2),
    unreadCount: 1,
  },
  {
    id: MOCK_CHAT_IDS.instagram_carol,
    platformChatId: MOCK_CHAT_IDS.instagram_carol,
    platform: Platform.INSTAGRAM,
    userId: MOCK_USER_ID,
    name: 'Carol (IG)',
    isGroup: false,
    lastMessageAt: ts(3),
    unreadCount: 0,
  },
  {
    id: MOCK_CHAT_IDS.whatsapp_group,
    platformChatId: MOCK_CHAT_IDS.whatsapp_group,
    platform: Platform.WHATSAPP,
    userId: MOCK_USER_ID,
    name: 'Team Chat',
    isGroup: true,
    participantCount: 4,
    lastMessageAt: ts(1),
    unreadCount: 0,
  },
];

// ─── Messages ──────────────────────────────────────────────────────────────

export const MOCK_MESSAGES: UnifiedMessage[] = [
  // WhatsApp - Alice chat
  {
    id: MOCK_MESSAGE_IDS.wa_alice_1,
    platformMessageId: MOCK_MESSAGE_IDS.wa_alice_1,
    platform: Platform.WHATSAPP,
    sessionId: MOCK_SESSION_ID,
    userId: MOCK_USER_ID,
    content: 'Hey, can you send me the project report?',
    contentType: MessageContentType.TEXT,
    senderId: MOCK_CONTACT_IDS.alice,
    senderName: 'Alice (WA)',
    chatId: MOCK_CHAT_IDS.whatsapp_alice,
    chatType: 'individual',
    chatName: 'Alice (WA)',
    timestamp: ts(0),
    isFromMe: false,
    isRead: true,
    hasMedia: false,
  },
  {
    id: MOCK_MESSAGE_IDS.wa_alice_promise,
    platformMessageId: MOCK_MESSAGE_IDS.wa_alice_promise,
    platform: Platform.WHATSAPP,
    sessionId: MOCK_SESSION_ID,
    userId: MOCK_USER_ID,
    content: PROMISE_MESSAGE_TEXT,
    contentType: MessageContentType.TEXT,
    senderId: MOCK_USER_ID,
    chatId: MOCK_CHAT_IDS.whatsapp_alice,
    chatType: 'individual',
    chatName: 'Alice (WA)',
    timestamp: ts(1),
    isFromMe: true,
    isRead: true,
    hasMedia: false,
  },
  {
    id: MOCK_MESSAGE_IDS.wa_alice_2,
    platformMessageId: MOCK_MESSAGE_IDS.wa_alice_2,
    platform: Platform.WHATSAPP,
    sessionId: MOCK_SESSION_ID,
    userId: MOCK_USER_ID,
    content: 'Thanks! Looking forward to it.',
    contentType: MessageContentType.TEXT,
    senderId: MOCK_CONTACT_IDS.alice,
    senderName: 'Alice (WA)',
    chatId: MOCK_CHAT_IDS.whatsapp_alice,
    chatType: 'individual',
    chatName: 'Alice (WA)',
    timestamp: ts(2),
    isFromMe: false,
    isRead: false,
    hasMedia: false,
  },
  {
    id: MOCK_MESSAGE_IDS.wa_alice_reply,
    platformMessageId: MOCK_MESSAGE_IDS.wa_alice_reply,
    platform: Platform.WHATSAPP,
    sessionId: MOCK_SESSION_ID,
    userId: MOCK_USER_ID,
    content: 'Sure, will do!',
    contentType: MessageContentType.TEXT,
    senderId: MOCK_USER_ID,
    chatId: MOCK_CHAT_IDS.whatsapp_alice,
    chatType: 'individual',
    chatName: 'Alice (WA)',
    timestamp: ts(4),
    isFromMe: true,
    isRead: true,
    hasMedia: false,
  },

  // Telegram - Bob chat
  {
    id: MOCK_MESSAGE_IDS.tg_bob_1,
    platformMessageId: MOCK_MESSAGE_IDS.tg_bob_1,
    platform: Platform.TELEGRAM,
    sessionId: MOCK_SESSION_ID,
    userId: MOCK_USER_ID,
    content: 'Are we still meeting tomorrow?',
    contentType: MessageContentType.TEXT,
    senderId: MOCK_CONTACT_IDS.bob,
    senderName: 'Bob (TG)',
    chatId: MOCK_CHAT_IDS.telegram_bob,
    chatType: 'individual',
    chatName: 'Bob (TG)',
    timestamp: ts(1),
    isFromMe: false,
    isRead: false,
    hasMedia: false,
  },
  {
    id: MOCK_MESSAGE_IDS.tg_bob_2,
    platformMessageId: MOCK_MESSAGE_IDS.tg_bob_2,
    platform: Platform.TELEGRAM,
    sessionId: MOCK_SESSION_ID,
    userId: MOCK_USER_ID,
    content: "Yes, I'll be there at 2pm.",
    contentType: MessageContentType.TEXT,
    senderId: MOCK_USER_ID,
    chatId: MOCK_CHAT_IDS.telegram_bob,
    chatType: 'individual',
    chatName: 'Bob (TG)',
    timestamp: ts(2),
    isFromMe: true,
    isRead: true,
    hasMedia: false,
  },

  // Instagram - Carol chat
  {
    id: MOCK_MESSAGE_IDS.ig_carol_1,
    platformMessageId: MOCK_MESSAGE_IDS.ig_carol_1,
    platform: Platform.INSTAGRAM,
    sessionId: MOCK_SESSION_ID,
    userId: MOCK_USER_ID,
    content: 'Loved your latest post!',
    contentType: MessageContentType.TEXT,
    senderId: MOCK_CONTACT_IDS.carol,
    senderName: 'Carol (IG)',
    chatId: MOCK_CHAT_IDS.instagram_carol,
    chatType: 'individual',
    chatName: 'Carol (IG)',
    timestamp: ts(2),
    isFromMe: false,
    isRead: true,
    hasMedia: false,
  },
  {
    id: MOCK_MESSAGE_IDS.ig_carol_2,
    platformMessageId: MOCK_MESSAGE_IDS.ig_carol_2,
    platform: Platform.INSTAGRAM,
    sessionId: MOCK_SESSION_ID,
    userId: MOCK_USER_ID,
    content: 'Thank you so much! 🙏',
    contentType: MessageContentType.TEXT,
    senderId: MOCK_USER_ID,
    chatId: MOCK_CHAT_IDS.instagram_carol,
    chatType: 'individual',
    chatName: 'Carol (IG)',
    timestamp: ts(3),
    isFromMe: true,
    isRead: true,
    hasMedia: false,
  },

  // WhatsApp - Group chat
  {
    id: MOCK_MESSAGE_IDS.wa_group_1,
    platformMessageId: MOCK_MESSAGE_IDS.wa_group_1,
    platform: Platform.WHATSAPP,
    sessionId: MOCK_SESSION_ID,
    userId: MOCK_USER_ID,
    content: 'Team standup in 10 minutes!',
    contentType: MessageContentType.TEXT,
    senderId: MOCK_CONTACT_IDS.alice,
    senderName: 'Alice (WA)',
    chatId: MOCK_CHAT_IDS.whatsapp_group,
    chatType: 'group',
    chatName: 'Team Chat',
    timestamp: ts(0),
    isFromMe: false,
    isRead: true,
    hasMedia: false,
  },
  {
    id: MOCK_MESSAGE_IDS.wa_group_2,
    platformMessageId: MOCK_MESSAGE_IDS.wa_group_2,
    platform: Platform.WHATSAPP,
    sessionId: MOCK_SESSION_ID,
    userId: MOCK_USER_ID,
    content: 'On my way 👍',
    contentType: MessageContentType.TEXT,
    senderId: MOCK_USER_ID,
    chatId: MOCK_CHAT_IDS.whatsapp_group,
    chatType: 'group',
    chatName: 'Team Chat',
    timestamp: ts(1),
    isFromMe: true,
    isRead: true,
    hasMedia: false,
  },
];

// ─── Fixture summary (for docs/tests) ──────────────────────────────────────

export const FIXTURE_SUMMARY = {
  userId: MOCK_USER_ID,
  sessionId: MOCK_SESSION_ID,
  platforms: ['whatsapp', 'telegram', 'instagram'] as const,
  chatCount: MOCK_CHATS.length,
  messageCount: MOCK_MESSAGES.length,
  promiseMessageId: MOCK_MESSAGE_IDS.wa_alice_promise,
  promiseMessageText: PROMISE_MESSAGE_TEXT,
  unreadCount: MOCK_CHATS.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0),
};
