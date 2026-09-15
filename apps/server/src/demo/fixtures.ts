/**
 * Demo fixture construction
 *
 * Turns the persona pack into the unified shapes the rest of the server already
 * understands. Everything here is derived — the script in personas.ts is the
 * single source of truth, and this module is the only place that knows how a
 * scripted line becomes a `UnifiedMessage`.
 *
 * Two consumers share these builders: the seed script (which replays messages
 * through the real ingestion path) and the demo adapter (which answers session,
 * chat, and history queries). Sharing them is what keeps a seeded account and a
 * live one from drifting apart.
 */

import {
  MessageContentType,
  Platform,
  PlatformSession,
  PlatformStatus,
  AuthMethod,
  UnifiedChat,
  UnifiedContact,
  UnifiedMessage,
  PlatformCapabilities,
} from '../adapters/types';
import { GHOST_USER_PREFIXES } from '../adapters/matrix/types';
import {
  DEMO_CHATS,
  DEMO_PERSONAS,
  DEMO_PERSONAS_BY_KEY,
  DemoChat,
  resolveScriptTime,
} from './personas';

/** Platforms a demo account presents as connected. */
export const DEMO_PLATFORMS: Platform[] = [Platform.WHATSAPP, Platform.TELEGRAM, Platform.INSTAGRAM];

/**
 * The demo account's own identity on each platform. Real bridges report the
 * connected account's own handle here, and the Connections screen shows it.
 */
export const DEMO_SELF_IDENTITY: Record<string, { platformUserId: string; phoneNumber?: string; platformUsername?: string }> = {
  [Platform.WHATSAPP]: { platformUserId: '15550104417', phoneNumber: '+1 555 010 4417' },
  [Platform.TELEGRAM]: { platformUserId: '481200937', platformUsername: '@claire_demo' },
  [Platform.INSTAGRAM]: { platformUserId: '17841400012288', platformUsername: '@claire.demo' },
};

/**
 * Matrix ghost identity for a demo persona.
 *
 * Ingestion derives a contact from `senderId` by extracting the platform id out
 * of a bridge ghost MXID (see `incomingContactId`). A plain phone number does
 * not match that pattern, so a fixture that used one would ingest messages with
 * no contact attached at all — chats would appear, but the People screen and
 * every avatar would be empty. Demo events therefore carry exactly the identity
 * shape a real mautrix bridge emits.
 */
export function demoGhostId(platform: Platform, platformContactId: string): string {
  const prefix = GHOST_USER_PREFIXES[platform];
  return `@${prefix}${platformContactId}:${DEMO_MATRIX_SERVER_NAME}`;
}

/** The regex that reads these back ignores the server name; keep it conventional. */
const DEMO_MATRIX_SERVER_NAME = process.env.MATRIX_SERVER_NAME || 'claire.local';

const DEMO_CAPABILITIES: PlatformCapabilities = {
  canSendText: true,
  canSendMedia: false,
  canSendStickers: false,
  canSendVoice: false,
  canSendLocation: false,
  canCreateGroups: false,
  canReadReceipts: true,
  canEditMessages: false,
  canDeleteMessages: false,
  canReactToMessages: true,
  canReplyToMessages: true,
  maxMessageLength: 4096,
  supportedMediaTypes: [MessageContentType.TEXT],
};

export const DEMO_SESSION_PREFIX = 'demo-session';

/**
 * Session identifiers carry the owning account.
 *
 * `getSession(sessionId)` has no user parameter, and the send route authorises
 * by comparing the returned session's `userId` to the caller. Encoding the
 * owner in the identifier means that check is answerable without a lookup, and
 * that two demo accounts can never be handed each other's sessions.
 */
export function demoSessionId(platform: Platform, userId: string): string {
  return `${DEMO_SESSION_PREFIX}-${platform}-${userId}`;
}

export interface ParsedDemoSession {
  platform: Platform;
  userId: string;
}

export function parseDemoSessionId(sessionId: string): ParsedDemoSession | null {
  if (!sessionId?.startsWith(`${DEMO_SESSION_PREFIX}-`)) return null;
  const remainder = sessionId.slice(DEMO_SESSION_PREFIX.length + 1);
  const separator = remainder.indexOf('-');
  if (separator <= 0) return null;
  const platform = remainder.slice(0, separator) as Platform;
  const userId = remainder.slice(separator + 1);
  if (!DEMO_PLATFORMS.includes(platform) || !userId) return null;
  return { platform, userId };
}

export function isDemoSessionId(sessionId: string): boolean {
  return parseDemoSessionId(sessionId) !== null;
}

// ─── Sessions ──────────────────────────────────────────────────────────────

export function buildDemoSessions(userId: string, now = new Date()): PlatformSession[] {
  return DEMO_PLATFORMS.map((platform) => {
    const identity = DEMO_SELF_IDENTITY[platform];
    return {
      id: demoSessionId(platform, userId),
      platform,
      userId,
      status: PlatformStatus.CONNECTED,
      authMethod: platform === Platform.WHATSAPP ? AuthMethod.QR_CODE : AuthMethod.USERNAME_PASSWORD,
      platformUserId: identity.platformUserId,
      platformUsername: identity.platformUsername,
      phoneNumber: identity.phoneNumber,
      // Backdated so the Connections screen reads "connected 3 weeks ago"
      // rather than "connected seconds ago" right after a seed.
      createdAt: new Date(now.getTime() - 21 * 86_400_000),
      lastConnectedAt: new Date(now.getTime() - 4 * 60_000),
      capabilities: DEMO_CAPABILITIES,
    };
  });
}

export { DEMO_CAPABILITIES };

// ─── Contacts ──────────────────────────────────────────────────────────────

export function buildDemoContacts(userId: string): UnifiedContact[] {
  return DEMO_PERSONAS.map((persona) => ({
    id: `demo-contact-${persona.key}`,
    platformContactId: persona.platformContactId,
    platform: persona.platform,
    userId,
    displayName: persona.displayName,
    phoneNumber: persona.phoneNumber,
    username: persona.username,
    avatarUrl: persona.avatarUrl,
    isBlocked: false,
    isVerified: false,
  }));
}

// ─── Chats ─────────────────────────────────────────────────────────────────

export function buildDemoChats(userId: string, now = new Date()): UnifiedChat[] {
  return DEMO_CHATS.map((chat) => {
    const lastLine = chat.script[chat.script.length - 1];
    return {
      id: `demo-chat-${chat.key}`,
      platformChatId: chat.platformChatId,
      platform: chat.platform,
      userId,
      name: chat.name,
      isGroup: chat.isGroup,
      participantCount: chat.isGroup ? chat.participants.length + 1 : 2,
      avatarUrl: chat.isGroup ? undefined : DEMO_PERSONAS_BY_KEY[chat.participants[0]]?.avatarUrl,
      lastMessageAt: lastLine ? resolveScriptTime(lastLine, now) : undefined,
      unreadCount: 0,
      isMuted: false,
      isArchived: false,
    };
  });
}

// ─── Messages ──────────────────────────────────────────────────────────────

/**
 * Platform message identifiers are deterministic per chat and position.
 *
 * Ingestion upserts on this identifier with `ignoreDuplicates`, so a second
 * seed run is a no-op rather than a duplicated inbox — which matters when a
 * take goes wrong and the account needs re-seeding between shots.
 */
export function demoMessageId(chatKey: string, index: number): string {
  return `demo-msg-${chatKey}-${String(index).padStart(3, '0')}`;
}

function buildChatMessages(chat: DemoChat, userId: string, now: Date): UnifiedMessage[] {
  return chat.script.map((line, index) => {
    const fromMe = line.from === 'me';
    const persona = fromMe ? undefined : DEMO_PERSONAS_BY_KEY[line.from];
    const senderId = fromMe
      ? demoGhostId(chat.platform, DEMO_SELF_IDENTITY[chat.platform].platformUserId)
      : demoGhostId(chat.platform, persona?.platformContactId ?? line.from);

    return {
      id: demoMessageId(chat.key, index),
      platformMessageId: demoMessageId(chat.key, index),
      platform: chat.platform,
      sessionId: demoSessionId(chat.platform, userId),
      userId,
      content: line.text,
      contentType: MessageContentType.TEXT,
      senderId,
      senderName: fromMe ? undefined : persona?.displayName,
      chatId: chat.platformChatId,
      chatType: chat.isGroup ? 'group' : 'individual',
      chatName: chat.name,
      timestamp: resolveScriptTime(line, now),
      isFromMe: fromMe,
      // Scripted history is history: it must not arrive as a pile of unread
      // badges. Live replies during a demo are a separate path and do count.
      isRead: true,
      hasMedia: false,
      memberCount: chat.isGroup ? chat.participants.length + 1 : 2,
      // Seeded history IS history, so it is ingested as backfill. That
      // suppresses the push-notification storm and unread inflation a replay
      // would otherwise cause. The seed then restores unread counts and
      // triggers loop detection and one fresh suggestion per chat explicitly,
      // which is both cheaper and closer to what a real inbox looks like.
      platformMetadata: { demo: true, demoChatKey: chat.key, syncKind: 'backfill' },
    } satisfies UnifiedMessage;
  });
}

/**
 * Every scripted message for the account, oldest first.
 *
 * Ordering matters: ingestion resolves reply references and chat `last_message_at`
 * as it goes, so replaying out of order would leave the inbox sorted oddly.
 */
export function buildDemoMessages(userId: string, now = new Date()): UnifiedMessage[] {
  return DEMO_CHATS.flatMap((chat) => buildChatMessages(chat, userId, now)).sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
  );
}

/** Scripted history for one chat, by its platform chat id. */
export function buildDemoChatHistory(
  platformChatId: string,
  userId: string,
  now = new Date()
): UnifiedMessage[] {
  const chat = DEMO_CHATS.find((candidate) => candidate.platformChatId === platformChatId);
  if (!chat) return [];
  return buildChatMessages(chat, userId, now);
}

/** The chat definition behind a platform chat id, for the responder. */
export function findDemoChat(platformChatId: string): DemoChat | undefined {
  return DEMO_CHATS.find((chat) => chat.platformChatId === platformChatId);
}

export interface DemoFixtureSummary {
  personas: number;
  chats: number;
  groups: number;
  messages: number;
  platforms: Platform[];
}

export function demoFixtureSummary(): DemoFixtureSummary {
  return {
    personas: DEMO_PERSONAS.length,
    chats: DEMO_CHATS.length,
    groups: DEMO_CHATS.filter((chat) => chat.isGroup).length,
    messages: DEMO_CHATS.reduce((total, chat) => total + chat.script.length, 0),
    platforms: DEMO_PLATFORMS,
  };
}
