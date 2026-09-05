import { host } from '@claire/host';

/** Browser remains network-first. Electron is the exception: its main process
 * supplies an OS-encrypted cache, so the renderer never writes message bodies
 * to localStorage, IndexedDB, or the browser profile. */
export type CachedChat = Record<string, unknown> & { id: string; latest_message?: Record<string, unknown> | null };
export type CachedMessage = { id: string; chat_id: string; timestamp: string; [key: string]: unknown };
export type CachedContact = Record<string, unknown> & { id: string };
export type MobileCacheSnapshot = { chats: CachedChat[]; messages: CachedMessage[]; contacts: CachedContact[]; contactsSyncedAt: string | null; conversationSettings: Record<string, Record<string, unknown>>; queries: Record<string, { data: unknown; updatedAt: string }>; loops: Record<string, unknown>[]; preferences: Record<string, unknown> | null; cursor: number | null; fullHistoryEnabled: boolean; lastSyncAt: string | null };

const memory = new Map<string, MobileCacheSnapshot>();
const emptySnapshot = (): MobileCacheSnapshot => ({ chats: [], messages: [], contacts: [], contactsSyncedAt: null, conversationSettings: {}, queries: {}, loops: [], preferences: null, cursor: null, fullHistoryEnabled: false, lastSyncAt: null });
const enabled = () => host.name === 'electron' && host.capabilities.encryptedCache;

async function load(userId: string): Promise<MobileCacheSnapshot> {
  const existing = memory.get(userId);
  if (existing) return existing;
  if (!enabled()) return emptySnapshot();
  try {
    const value = await host.readEncryptedCache(userId);
    const parsed = value ? JSON.parse(value) as Partial<MobileCacheSnapshot> : null;
    const snapshot: MobileCacheSnapshot = parsed && Array.isArray(parsed.chats) && Array.isArray(parsed.messages) ? { ...emptySnapshot(), ...parsed } : emptySnapshot();
    memory.set(userId, snapshot);
    return snapshot;
  } catch { return emptySnapshot(); }
}

async function persist(userId: string, snapshot: MobileCacheSnapshot): Promise<void> {
  memory.set(userId, snapshot);
  if (enabled()) await host.writeEncryptedCache(userId, JSON.stringify(snapshot));
}

export function usesNativeMobileCache() { return enabled(); }
export async function hydrateMobileCache(userId: string) { return load(userId); }
export async function cachedTimeline(userId: string, chatId: string, limit = 200) { return (await load(userId)).messages.filter((message) => message.chat_id === chatId).sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, limit).reverse(); }
export async function cacheTimeline<T extends { id: string; chat_id: string; timestamp: string }>(userId: string, chatId: string, messages: T[]) {
  const snapshot = await load(userId);
  const byId = new Map(snapshot.messages.map((message) => [message.id, message]));
  messages.forEach((message) => byId.set(message.id, message));
  const all = [...byId.values()];
  const retained = snapshot.fullHistoryEnabled ? all : all.filter((message) => message.chat_id !== chatId).concat(all.filter((message) => message.chat_id === chatId).sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 200));
  await persist(userId, { ...snapshot, messages: retained, lastSyncAt: new Date().toISOString() });
}
export async function cachedConversationSettings(userId: string, chatId: string): Promise<Record<string, unknown> | null> {
  return (await load(userId)).conversationSettings?.[chatId] ?? null;
}
export async function cacheConversationSettings(userId: string, chatId: string, settings: Record<string, unknown>): Promise<void> {
  const snapshot = await load(userId);
  const existing = snapshot.conversationSettings?.[chatId] || {};
  await persist(userId, { ...snapshot, conversationSettings: { ...(snapshot.conversationSettings || {}), [chatId]: { ...existing, ...settings } } });
}
export async function cachedContacts(userId: string): Promise<CachedContact[]> {
  return (await load(userId)).contacts || [];
}
export async function replaceCachedContacts(userId: string, contacts: CachedContact[]): Promise<void> {
  const snapshot = await load(userId);
  await persist(userId, { ...snapshot, contacts, contactsSyncedAt: new Date().toISOString() });
}
export async function cachedContactsSyncedAt(userId: string): Promise<string | null> {
  return (await load(userId)).contactsSyncedAt ?? null;
}
export async function oldestCachedMessage(userId: string, chatId: string) { const row = (await load(userId)).messages.filter((message) => message.chat_id === chatId).sort((a, b) => a.timestamp.localeCompare(b.timestamp))[0]; return row ? { id: row.id, timestamp: row.timestamp } : null; }
export async function cacheBootstrap(userId: string, bootstrap: { cursor: number; chats: CachedChat[]; loops: Record<string, unknown>[]; preferences: Record<string, unknown> | null }) {
  const current = await load(userId);
  await persist(userId, { ...current, ...bootstrap, cursor: bootstrap.cursor, lastSyncAt: new Date().toISOString() });
}
export async function applyMobileSyncEvents(userId: string, events: Array<{ cursor: number; entity_type: string; entity_id: string; operation: string; payload: Record<string, unknown> | null }>, cursor: number) {
  const snapshot = await load(userId);
  let chats = snapshot.chats; let messages = snapshot.messages; let loops = snapshot.loops; let preferences = snapshot.preferences;
  for (const event of events) {
    const replace = <T extends { id: string }>(items: T[], value: T) => [...items.filter((item) => item.id !== value.id), value];
    if (event.entity_type === 'chat') chats = event.operation === 'delete' ? chats.filter((item) => item.id !== event.entity_id) : event.payload?.id ? replace(chats, event.payload as CachedChat) : chats;
    if (event.entity_type === 'message') messages = event.operation === 'delete' ? messages.filter((item) => item.id !== event.entity_id) : event.payload?.id ? replace(messages, event.payload as CachedMessage) : messages;
    if (event.entity_type === 'loop') loops = event.operation === 'delete' ? loops.filter((item) => item.id !== event.entity_id) : event.payload?.id ? replace(loops as Array<Record<string, unknown> & { id: string }>, event.payload as Record<string, unknown> & { id: string }) : loops;
    if (event.entity_type === 'preference' && event.operation === 'upsert') preferences = event.payload;
  }
  await persist(userId, { ...snapshot, chats, messages, loops, preferences, cursor, lastSyncAt: new Date().toISOString() });
}
export async function setFullHistoryEnabled(userId: string, enabledValue: boolean) { const snapshot = await load(userId); await persist(userId, { ...snapshot, fullHistoryEnabled: enabledValue }); }
export async function clearMobileCache(userId: string) { memory.delete(userId); if (enabled()) await host.clearEncryptedCache(userId); }

/**
 * Twins of the native readers and writers.
 *
 * Metro resolves this file on web and in Electron, so a function that exists
 * only in mobile-cache.native is a runtime crash on the desktop app rather than
 * a type error. mobileCacheParity.test.ts asserts the two lists stay level.
 */
export async function cachedLoops(userId: string): Promise<Array<Record<string, unknown>>> {
  return (await load(userId)).loops || [];
}

export async function cachedLoop(userId: string, loopId: string): Promise<Record<string, unknown> | null> {
  const loops = (await load(userId)).loops || [];
  return (loops as Array<Record<string, unknown>>).find((loop) => loop.id === loopId) ?? null;
}

export async function cachedCursor(userId: string): Promise<number> {
  return (await load(userId)).cursor ?? 0;
}

export async function cachedMessageCount(userId: string, chatId: string): Promise<number> {
  return ((await load(userId)).messages || []).filter((message) => message.chat_id === chatId).length;
}

function timestampValue(value: unknown): number {
  if (typeof value !== 'string') return Number.NaN;
  return Date.parse(value);
}

/** Merge, never replace: realtime chat rows carry no contact join or preview. */
export async function patchCachedChat(userId: string, chatId: string, patch: Record<string, unknown>): Promise<void> {
  if (!chatId) return;
  const snapshot = await load(userId);
  const existing = snapshot.chats.find((chat) => chat.id === chatId);
  if (!existing) return;
  const merged = { ...existing, ...patch, id: chatId } as CachedChat;
  await persist(userId, { ...snapshot, chats: snapshot.chats.map((chat) => (chat.id === chatId ? merged : chat)) });
}

/** Keep a conversation's inbox preview current from a single message. */
export async function touchCachedChatFromMessage(
  userId: string,
  message: Record<string, unknown> & { id?: unknown; chat_id?: unknown; timestamp?: unknown },
): Promise<void> {
  const chatId = typeof message.chat_id === 'string' ? message.chat_id : null;
  const messageId = typeof message.id === 'string' ? message.id : null;
  if (!chatId || !messageId) return;
  const snapshot = await load(userId);
  const existing = snapshot.chats.find((chat) => chat.id === chatId);
  if (!existing) return;
  const latest = existing.latest_message as Record<string, unknown> | null | undefined;
  const isSameMessage = !!latest && latest.id === messageId;
  const incomingAt = timestampValue(message.timestamp);
  const currentAt = timestampValue(latest?.timestamp);
  const isNewer = Number.isNaN(incomingAt) ? false : Number.isNaN(currentAt) || incomingAt > currentAt;
  if (!isSameMessage && !isNewer) return;
  const next = {
    ...existing,
    latest_message: { ...message, chat_id: chatId },
    ...(isNewer && typeof message.timestamp === 'string' ? { last_message_at: message.timestamp } : {}),
    ...(!isSameMessage && isNewer && message.from_me === false
      ? { unread_count: (typeof existing.unread_count === 'number' ? existing.unread_count : 0) + 1 }
      : {}),
  } as CachedChat;
  await persist(userId, { ...snapshot, chats: snapshot.chats.map((chat) => (chat.id === chatId ? next : chat)) });
}

export async function readQuerySnapshot<T = unknown>(userId: string, key: string): Promise<{ data: T; updatedAt: string } | null> {
  const entry = (await load(userId)).queries?.[key];
  return entry ? { data: entry.data as T, updatedAt: entry.updatedAt } : null;
}

export async function writeQuerySnapshot(userId: string, key: string, data: unknown): Promise<void> {
  if (data === undefined) return;
  const snapshot = await load(userId);
  await persist(userId, { ...snapshot, queries: { ...(snapshot.queries || {}), [key]: { data, updatedAt: new Date().toISOString() } } });
}

export async function deleteQuerySnapshots(userId: string, prefix?: string): Promise<void> {
  const snapshot = await load(userId);
  if (!prefix) {
    await persist(userId, { ...snapshot, queries: {} });
    return;
  }
  const kept = Object.fromEntries(Object.entries(snapshot.queries || {}).filter(([key]) => !key.startsWith(prefix)));
  await persist(userId, { ...snapshot, queries: kept });
}
