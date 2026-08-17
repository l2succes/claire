import { Platform } from 'react-native';

export type CachedChat = Record<string, unknown> & { id: string; latest_message?: Record<string, unknown> | null };
export type CachedMessage = { id: string; chat_id: string; timestamp: string; [key: string]: unknown };
export type MobileCacheSnapshot = {
  cursor: number;
  chats: CachedChat[];
  loops: Record<string, unknown>[];
  preferences: Record<string, unknown> | null;
  lastSyncAt: string | null;
  fullHistoryEnabled: boolean;
};

type SyncEvent = {
  cursor: number;
  entity_type: 'chat' | 'message' | 'loop' | 'contact' | 'preference';
  entity_id: string;
  operation: 'upsert' | 'delete';
  payload: Record<string, unknown> | null;
};

const isNativeMobile = Platform.OS === 'ios' || Platform.OS === 'android';
const memory = new Map<string, MobileCacheSnapshot>();
const databases = new Map<string, any>();

const emptySnapshot = (): MobileCacheSnapshot => ({
  cursor: 0,
  chats: [],
  loops: [],
  preferences: null,
  lastSyncAt: null,
  fullHistoryEnabled: false,
});

function filename(userId: string) {
  return `claire-mobile-${userId.replace(/[^a-zA-Z0-9-]/g, '')}.db`;
}

function secureKeyName(userId: string) {
  return `claire.mobile.cache.key.${userId}`;
}

function modules() {
  if (!isNativeMobile) return null;
  // Keep native-only modules out of the web execution path. This lets the
  // shared Expo web client remain memory-only for private message content.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const SQLite = require('expo-sqlite') as typeof import('expo-sqlite');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const SecureStore = require('expo-secure-store') as typeof import('expo-secure-store');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Crypto = require('expo-crypto') as typeof import('expo-crypto');
  return { SQLite, SecureStore, Crypto };
}

async function database(userId: string): Promise<any | null> {
  if (!isNativeMobile) return null;
  const existing = databases.get(userId);
  if (existing) return existing;
  const native = modules();
  if (!native) return null;
  let attemptedDb: any | null = null;
  const open = async (replaceExisting: boolean): Promise<any> => {
    if (replaceExisting) {
      // A previous pre-encryption build can leave a plaintext database behind.
      // It contains only the local replica, so recreate it rather than blocking
      // startup. Server history is never affected.
      await native.SQLite.deleteDatabaseAsync(filename(userId));
      await native.SecureStore.deleteItemAsync(secureKeyName(userId));
    }
    let key = await native.SecureStore.getItemAsync(secureKeyName(userId));
    if (!key) {
      const bytes = await native.Crypto.getRandomBytesAsync(32);
      key = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
      await native.SecureStore.setItemAsync(secureKeyName(userId), key, {
        keychainAccessible: native.SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
    }
    const db = await native.SQLite.openDatabaseAsync(filename(userId));
    if (!replaceExisting) attemptedDb = db;
    await db.execAsync(`PRAGMA key = "x'${key}'"; PRAGMA cipher_memory_security = ON; PRAGMA journal_mode = WAL;`);
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS cache_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cache_chats (id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cache_messages (id TEXT PRIMARY KEY NOT NULL, chat_id TEXT NOT NULL, timestamp TEXT NOT NULL, payload TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_cache_messages_chat_timestamp ON cache_messages(chat_id, timestamp DESC, id DESC);
      CREATE TABLE IF NOT EXISTS cache_contacts (id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cache_loops (id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL);
    `);
    return db;
  };
  try {
    const db = await open(false);
    databases.set(userId, db);
    return db;
  } catch (error) {
    if (!/file is not a database|file is encrypted/i.test(String(error))) throw error;
    await attemptedDb?.closeAsync?.();
    attemptedDb = null;
    const db = await open(true);
    databases.set(userId, db);
    return db;
  }
}

async function meta(db: any, key: string, fallback: string) {
  const row = await db.getFirstAsync('SELECT value FROM cache_meta WHERE key = ?', key) as { value?: string } | null;
  return row?.value ?? fallback;
}

async function setMeta(db: any, key: string, value: string) {
  await db.runAsync('INSERT INTO cache_meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
}

async function upsert(db: any, table: string, item: Record<string, unknown>) {
  const id = typeof item.id === 'string' ? item.id : null;
  if (!id) return;
  const now = new Date().toISOString();
  if (table === 'cache_messages') {
    const chatId = typeof item.chat_id === 'string' ? item.chat_id : null;
    const timestamp = typeof item.timestamp === 'string' ? item.timestamp : now;
    if (!chatId) return;
    await db.runAsync(
      'INSERT INTO cache_messages(id, chat_id, timestamp, payload) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET chat_id = excluded.chat_id, timestamp = excluded.timestamp, payload = excluded.payload',
      id, chatId, timestamp, JSON.stringify(item),
    );
    return;
  }
  await db.runAsync(
    `INSERT INTO ${table}(id, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
    id, JSON.stringify(item), now,
  );
}

async function trimRecentMessages(db: any, chatId: string, keep = 200) {
  await db.runAsync(
    'DELETE FROM cache_messages WHERE chat_id = ? AND id NOT IN (SELECT id FROM cache_messages WHERE chat_id = ? ORDER BY timestamp DESC, id DESC LIMIT ?)',
    chatId, chatId, keep,
  );
}

export function usesNativeMobileCache() {
  return isNativeMobile;
}

export async function hydrateMobileCache(userId: string): Promise<MobileCacheSnapshot> {
  if (!isNativeMobile) return memory.get(userId) || emptySnapshot();
  const db = await database(userId);
  if (!db) return emptySnapshot();
  const [cursor, fullHistory, lastSyncAt, chats, loops, preferences] = await Promise.all([
    meta(db, 'cursor', '0'), meta(db, 'full_history_enabled', 'false'), meta(db, 'last_sync_at', ''),
    db.getAllAsync('SELECT payload FROM cache_chats ORDER BY json_extract(payload, "$.last_message_at") DESC') as Promise<Array<{ payload: string }>>,
    db.getAllAsync('SELECT payload FROM cache_loops') as Promise<Array<{ payload: string }>>,
    db.getFirstAsync('SELECT value FROM cache_meta WHERE key = "preferences"') as Promise<{ value: string } | null>,
  ]);
  const snapshot: MobileCacheSnapshot = {
    cursor: Number(cursor) || 0,
    chats: chats.map(row => JSON.parse(row.payload) as CachedChat),
    loops: loops.map(row => JSON.parse(row.payload) as Record<string, unknown>),
    preferences: preferences?.value ? JSON.parse(preferences.value) as Record<string, unknown> : null,
    lastSyncAt: lastSyncAt || null,
    fullHistoryEnabled: fullHistory === 'true',
  };
  memory.set(userId, snapshot);
  return snapshot;
}

export async function cachedTimeline(userId: string, chatId: string, limit = 200): Promise<CachedMessage[]> {
  if (!isNativeMobile) return [];
  const db = await database(userId);
  if (!db) return [];
  const rows = await db.getAllAsync('SELECT payload FROM cache_messages WHERE chat_id = ? ORDER BY timestamp DESC, id DESC LIMIT ?', chatId, limit) as Array<{ payload: string }>;
  return rows.reverse().map(row => JSON.parse(row.payload) as CachedMessage);
}

export async function cacheTimeline<T extends { id: string; chat_id: string; timestamp: string }>(userId: string, chatId: string, messages: T[]): Promise<void> {
  if (!isNativeMobile) return;
  const db = await database(userId);
  if (!db) return;
  for (const message of messages) await upsert(db, 'cache_messages', message);
  const fullHistory = await meta(db, 'full_history_enabled', 'false');
  if (fullHistory !== 'true') await trimRecentMessages(db, chatId);
}

export async function oldestCachedMessage(userId: string, chatId: string): Promise<{ timestamp: string; id: string } | null> {
  if (!isNativeMobile) return null;
  const db = await database(userId);
  if (!db) return null;
  return (await db.getFirstAsync('SELECT timestamp, id FROM cache_messages WHERE chat_id = ? ORDER BY timestamp ASC, id ASC LIMIT 1', chatId) as { timestamp: string; id: string } | null) || null;
}

export async function cacheBootstrap(userId: string, bootstrap: { cursor: number; chats: CachedChat[]; loops: Record<string, unknown>[]; preferences: Record<string, unknown> | null }): Promise<void> {
  if (!isNativeMobile) return;
  const db = await database(userId);
  if (!db) return;
  for (const chat of bootstrap.chats) {
    await upsert(db, 'cache_chats', chat);
    const latest = chat.latest_message;
    if (latest && typeof latest.id === 'string') await upsert(db, 'cache_messages', { ...latest, chat_id: latest.chat_id || chat.id });
  }
  for (const loop of bootstrap.loops) await upsert(db, 'cache_loops', loop);
  await setMeta(db, 'cursor', String(bootstrap.cursor));
  await setMeta(db, 'last_sync_at', new Date().toISOString());
  await setMeta(db, 'preferences', JSON.stringify(bootstrap.preferences));
  memory.set(userId, await hydrateMobileCache(userId));
}

export async function applyMobileSyncEvents(userId: string, events: SyncEvent[], cursor: number): Promise<void> {
  if (!isNativeMobile || !events.length) return;
  const db = await database(userId);
  if (!db) return;
  for (const event of events) {
    const table = event.entity_type === 'chat' ? 'cache_chats'
      : event.entity_type === 'message' ? 'cache_messages'
        : event.entity_type === 'loop' ? 'cache_loops'
          : event.entity_type === 'contact' ? 'cache_contacts' : null;
    if (event.entity_type === 'preference' && event.operation === 'upsert') {
      await setMeta(db, 'preferences', JSON.stringify(event.payload));
    } else if (table) {
      if (event.operation === 'delete') await db.runAsync(`DELETE FROM ${table} WHERE id = ?`, event.entity_id);
      else if (event.payload) await upsert(db, table, event.payload);
    }
    if (event.entity_type === 'message' && event.payload && typeof event.payload.chat_id === 'string') {
      const fullHistory = await meta(db, 'full_history_enabled', 'false');
      if (fullHistory !== 'true') await trimRecentMessages(db, event.payload.chat_id);
    }
  }
  await setMeta(db, 'cursor', String(cursor));
  await setMeta(db, 'last_sync_at', new Date().toISOString());
  memory.set(userId, await hydrateMobileCache(userId));
}

export async function setFullHistoryEnabled(userId: string, enabled: boolean): Promise<void> {
  if (!isNativeMobile) return;
  const db = await database(userId);
  if (db) await setMeta(db, 'full_history_enabled', String(enabled));
  const snapshot = memory.get(userId);
  if (snapshot) memory.set(userId, { ...snapshot, fullHistoryEnabled: enabled });
}

export async function clearMobileCache(userId: string): Promise<void> {
  memory.delete(userId);
  if (!isNativeMobile) return;
  const db = databases.get(userId);
  if (db) await db.closeAsync();
  databases.delete(userId);
  const native = modules();
  await (native?.SQLite as any)?.deleteDatabaseAsync?.(filename(userId));
  await native?.SecureStore.deleteItemAsync(secureKeyName(userId));
}
