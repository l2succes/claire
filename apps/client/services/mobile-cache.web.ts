import { host } from '@claire/host';

/** Browser remains network-first. Electron is the exception: its main process
 * supplies an OS-encrypted cache, so the renderer never writes message bodies
 * to localStorage, IndexedDB, or the browser profile. */
export type CachedChat = Record<string, unknown> & { id: string; latest_message?: Record<string, unknown> | null };
export type CachedMessage = { id: string; chat_id: string; timestamp: string; [key: string]: unknown };
export type MobileCacheSnapshot = { chats: CachedChat[]; messages: CachedMessage[]; promises: Record<string, unknown>[]; preferences: Record<string, unknown> | null; cursor: number | null; fullHistoryEnabled: boolean; lastSyncAt: string | null };

const memory = new Map<string, MobileCacheSnapshot>();
const emptySnapshot = (): MobileCacheSnapshot => ({ chats: [], messages: [], promises: [], preferences: null, cursor: null, fullHistoryEnabled: false, lastSyncAt: null });
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
export async function oldestCachedMessage(userId: string, chatId: string) { const row = (await load(userId)).messages.filter((message) => message.chat_id === chatId).sort((a, b) => a.timestamp.localeCompare(b.timestamp))[0]; return row ? { id: row.id, timestamp: row.timestamp } : null; }
export async function cacheBootstrap(userId: string, bootstrap: { cursor: number; chats: CachedChat[]; promises: Record<string, unknown>[]; preferences: Record<string, unknown> | null }) {
  const current = await load(userId);
  await persist(userId, { ...current, ...bootstrap, cursor: bootstrap.cursor, lastSyncAt: new Date().toISOString() });
}
export async function applyMobileSyncEvents(userId: string, events: Array<{ cursor: number; entity_type: string; entity_id: string; operation: string; payload: Record<string, unknown> | null }>, cursor: number) {
  const snapshot = await load(userId);
  let chats = snapshot.chats; let messages = snapshot.messages; let promises = snapshot.promises; let preferences = snapshot.preferences;
  for (const event of events) {
    const replace = <T extends { id: string }>(items: T[], value: T) => [...items.filter((item) => item.id !== value.id), value];
    if (event.entity_type === 'chat') chats = event.operation === 'delete' ? chats.filter((item) => item.id !== event.entity_id) : event.payload?.id ? replace(chats, event.payload as CachedChat) : chats;
    if (event.entity_type === 'message') messages = event.operation === 'delete' ? messages.filter((item) => item.id !== event.entity_id) : event.payload?.id ? replace(messages, event.payload as CachedMessage) : messages;
    if (event.entity_type === 'promise') promises = event.operation === 'delete' ? promises.filter((item) => item.id !== event.entity_id) : event.payload?.id ? replace(promises as Array<Record<string, unknown> & { id: string }>, event.payload as Record<string, unknown> & { id: string }) : promises;
    if (event.entity_type === 'preference' && event.operation === 'upsert') preferences = event.payload;
  }
  await persist(userId, { ...snapshot, chats, messages, promises, preferences, cursor, lastSyncAt: new Date().toISOString() });
}
export async function setFullHistoryEnabled(userId: string, enabledValue: boolean) { const snapshot = await load(userId); await persist(userId, { ...snapshot, fullHistoryEnabled: enabledValue }); }
export async function clearMobileCache(userId: string) { memory.delete(userId); if (enabled()) await host.clearEncryptedCache(userId); }
