import { Platform } from 'react-native';

export type CachedChat = Record<string, unknown> & { id: string; latest_message?: Record<string, unknown> | null };
export type CachedMessage = { id: string; chat_id: string; timestamp: string; [key: string]: unknown };
export type CachedContact = Record<string, unknown> & { id: string };
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
/**
 * Reads in flight, so the inbox, the loops screen and the sync loop asking for
 * the snapshot in the same tick share one table scan instead of three.
 */
const inflight = new Map<string, Promise<MobileCacheSnapshot>>();
const databases = new Map<string, any>();

/**
 * Drop the memoised snapshot after a write.
 *
 * Deliberately a delete rather than an in-place patch: the snapshot is derived
 * from five tables, and keeping a hand-patched copy consistent with every write
 * path is exactly the kind of bookkeeping that goes wrong silently. The next
 * reader pays for one re-read.
 */
function invalidateSnapshot(userId: string) {
  memory.delete(userId);
  inflight.delete(userId);
}

/** Bumped only for changes a fresh CREATE IF NOT EXISTS cannot express. */
const SCHEMA_VERSION = 2;

export const SCHEMA_SQL = `
      CREATE TABLE IF NOT EXISTS cache_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cache_chats (id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cache_messages (id TEXT PRIMARY KEY NOT NULL, chat_id TEXT NOT NULL, timestamp TEXT NOT NULL, payload TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_cache_messages_chat_timestamp ON cache_messages(chat_id, timestamp DESC, id DESC);
      CREATE TABLE IF NOT EXISTS cache_contacts (id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cache_loops (id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cache_conversation_settings (chat_id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cache_queries (key TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_cache_chats_last_message ON cache_chats(json_extract(payload, '$.last_message_at') DESC);
    `;

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
    await db.execAsync(SCHEMA_SQL);
    // The CREATE block above is the idempotent baseline and covers every
    // additive change. The stored version exists for the migrations it cannot
    // express -- a dropped column, a rebuilt index -- so those can run once
    // rather than on every open.
    await db.runAsync(
      'INSERT INTO cache_meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      'schema_version', String(SCHEMA_VERSION),
    );
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

async function setMeta(userId: string, db: any, key: string, value: string) {
  await db.runAsync('INSERT INTO cache_meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
  invalidateSnapshot(userId);
}

async function upsert(userId: string, db: any, table: string, item: Record<string, unknown>) {
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
    invalidateSnapshot(userId);
    return;
  }
  await db.runAsync(
    `INSERT INTO ${table}(id, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
    id, JSON.stringify(item), now,
  );
  invalidateSnapshot(userId);
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

/**
 * The whole snapshot, memoised until something writes.
 *
 * This used to re-read and re-parse every chat row on each call, and it is
 * called from the inbox, the loops screen and twice inside each sync pass --
 * so a cold start with twenty sync pages paid for the full table scan twenty
 * times over, competing with the very screens it was meant to make fast.
 */
export async function hydrateMobileCache(userId: string): Promise<MobileCacheSnapshot> {
  if (!isNativeMobile) return memory.get(userId) || emptySnapshot();
  const cached = memory.get(userId);
  if (cached) return cached;
  const pending = inflight.get(userId);
  if (pending) return pending;
  const read = (async (): Promise<MobileCacheSnapshot> => {
    const db = await database(userId);
    if (!db) return emptySnapshot();
    const [cursor, fullHistory, lastSyncAt, chats, loops, preferences] = await Promise.all([
      meta(db, 'cursor', '0'), meta(db, 'full_history_enabled', 'false'), meta(db, 'last_sync_at', ''),
      db.getAllAsync("SELECT payload FROM cache_chats ORDER BY json_extract(payload, '$.last_message_at') DESC") as Promise<Array<{ payload: string }>>,
      db.getAllAsync('SELECT payload FROM cache_loops') as Promise<Array<{ payload: string }>>,
      db.getFirstAsync("SELECT value FROM cache_meta WHERE key = 'preferences'") as Promise<{ value: string } | null>,
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
  })();
  inflight.set(userId, read);
  try {
    return await read;
  } finally {
    inflight.delete(userId);
  }
}

/**
 * Narrow readers.
 *
 * A screen that needs the loops should not pay to parse every chat. These exist
 * so callers can stop reaching for the whole snapshot out of convenience.
 */
export async function cachedLoops(userId: string): Promise<Array<Record<string, unknown>>> {
  if (!isNativeMobile) return [];
  const cached = memory.get(userId);
  if (cached) return cached.loops;
  const db = await database(userId);
  if (!db) return [];
  const rows = await db.getAllAsync('SELECT payload FROM cache_loops') as Array<{ payload: string }>;
  return rows.map(row => JSON.parse(row.payload) as Record<string, unknown>);
}

export async function cachedLoop(userId: string, loopId: string): Promise<Record<string, unknown> | null> {
  if (!isNativeMobile) return null;
  const db = await database(userId);
  if (!db) return null;
  const row = await db.getFirstAsync('SELECT payload FROM cache_loops WHERE id = ?', loopId) as { payload?: string } | null;
  if (!row?.payload) return null;
  try {
    return JSON.parse(row.payload) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function cachedCursor(userId: string): Promise<number> {
  if (!isNativeMobile) return 0;
  const cached = memory.get(userId);
  if (cached) return cached.cursor;
  const db = await database(userId);
  if (!db) return 0;
  return Number(await meta(db, 'cursor', '0')) || 0;
}

export async function cachedMessageCount(userId: string, chatId: string): Promise<number> {
  if (!isNativeMobile) return 0;
  const db = await database(userId);
  if (!db) return 0;
  const row = await db.getFirstAsync('SELECT COUNT(*) AS total FROM cache_messages WHERE chat_id = ?', chatId) as { total?: number } | null;
  return typeof row?.total === 'number' ? row.total : 0;
}

function timestampValue(value: unknown): number {
  if (typeof value !== 'string') return Number.NaN;
  return Date.parse(value);
}

/**
 * Merge a partial chat row into the cache.
 *
 * A merge and not a replace: realtime `chats` rows carry no `contact` join and
 * no `latest_message`, and the inbox's cold-start paint is built from exactly
 * those two fields. A replacing write would blank the name and avatar of every
 * conversation whose unread count changed.
 */
export async function patchCachedChat(userId: string, chatId: string, patch: Record<string, unknown>): Promise<void> {
  if (!isNativeMobile || !chatId) return;
  const db = await database(userId);
  if (!db) return;
  const row = await db.getFirstAsync('SELECT payload FROM cache_chats WHERE id = ?', chatId) as { payload?: string } | null;
  // An unknown chat is left to the sync stream, which has the full row. Writing
  // a stub here would put a nameless conversation in the inbox.
  if (!row?.payload) return;
  let existing: Record<string, unknown>;
  try {
    existing = JSON.parse(row.payload) as Record<string, unknown>;
  } catch {
    return;
  }
  const { latest_message: incomingLatest, contact: incomingContact, ...rest } = patch;
  await upsert(userId, db, 'cache_chats', {
    ...existing,
    ...rest,
    ...(incomingLatest !== undefined ? { latest_message: incomingLatest } : {}),
    ...(incomingContact !== undefined ? { contact: incomingContact } : {}),
    id: chatId,
  });
}

/**
 * Keep a conversation's inbox preview current from a single message.
 *
 * Without this the cached chat rows only moved when a foreground sync ran, so a
 * cold start painted previews and unread counts as old as the last time the app
 * was brought to the front -- the cache was fast and wrong, which is worse than
 * slow and right.
 */
export async function touchCachedChatFromMessage(
  userId: string,
  message: Record<string, unknown> & { id?: unknown; chat_id?: unknown; timestamp?: unknown },
): Promise<void> {
  if (!isNativeMobile) return;
  const chatId = typeof message.chat_id === 'string' ? message.chat_id : null;
  const messageId = typeof message.id === 'string' ? message.id : null;
  if (!chatId || !messageId) return;
  const db = await database(userId);
  if (!db) return;
  const row = await db.getFirstAsync('SELECT payload FROM cache_chats WHERE id = ?', chatId) as { payload?: string } | null;
  if (!row?.payload) return;
  let existing: Record<string, unknown>;
  try {
    existing = JSON.parse(row.payload) as Record<string, unknown>;
  } catch {
    return;
  }
  const latest = existing.latest_message as Record<string, unknown> | null | undefined;
  const isSameMessage = !!latest && latest.id === messageId;
  const incomingAt = timestampValue(message.timestamp);
  const currentAt = timestampValue(latest?.timestamp);
  const isNewer = Number.isNaN(incomingAt) ? false : Number.isNaN(currentAt) || incomingAt > currentAt;
  // An edit to some older message must not promote it to the preview.
  if (!isSameMessage && !isNewer) return;
  const next: Record<string, unknown> = {
    ...existing,
    latest_message: { ...message, chat_id: chatId },
    ...(isNewer && typeof message.timestamp === 'string' ? { last_message_at: message.timestamp } : {}),
  };
  // Provisional only. The `chats` UPDATE that follows carries the authoritative
  // count and overwrites this; the guess just avoids a beat where a new message
  // is visible with no unread dot.
  if (!isSameMessage && isNewer && message.from_me === false) {
    const current = typeof existing.unread_count === 'number' ? existing.unread_count : 0;
    next.unread_count = current + 1;
  }
  await upsert(userId, db, 'cache_chats', next);
}

/**
 * Opaque per-key snapshots for screens whose data is not a first-class entity:
 * the morning brief, a person or loop detail payload, a preferences form.
 *
 * Deliberately not a TanStack persister. A persister restores every stored
 * query at boot, which is the same "read everything before you can show
 * anything" cost this work exists to remove; a keyed read costs one indexed row
 * on the screen that actually needs it.
 */
export async function readQuerySnapshot<T = unknown>(userId: string, key: string): Promise<{ data: T; updatedAt: string } | null> {
  if (!isNativeMobile) return null;
  const db = await database(userId);
  if (!db) return null;
  const row = await db.getFirstAsync('SELECT payload, updated_at FROM cache_queries WHERE key = ?', key) as { payload?: string; updated_at?: string } | null;
  if (!row?.payload) return null;
  try {
    return { data: JSON.parse(row.payload) as T, updatedAt: row.updated_at || '' };
  } catch {
    return null;
  }
}

export async function writeQuerySnapshot(userId: string, key: string, data: unknown): Promise<void> {
  if (!isNativeMobile || data === undefined) return;
  const db = await database(userId);
  if (!db) return;
  await db.runAsync(
    'INSERT INTO cache_queries(key, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at',
    key, JSON.stringify(data), new Date().toISOString(),
  );
}

export async function deleteQuerySnapshots(userId: string, prefix?: string): Promise<void> {
  if (!isNativeMobile) return;
  const db = await database(userId);
  if (!db) return;
  if (prefix) await db.runAsync('DELETE FROM cache_queries WHERE key LIKE ?', `${prefix}%`);
  else await db.runAsync('DELETE FROM cache_queries');
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
  // One transaction, not one per row. A chat open caches its whole 100-message
  // page here while the push animation is still running; unwrapped, that is 100
  // serialized bridge round trips each committing its own WAL transaction.
  await db.withTransactionAsync(async () => {
    for (const message of messages) await upsert(userId, db, 'cache_messages', message);
  });
  const fullHistory = await meta(db, 'full_history_enabled', 'false');
  if (fullHistory !== 'true') await trimRecentMessages(db, chatId);
}

/**
 * The whole directory, straight off disk.
 *
 * People needs every contact in memory at once — its A–Z index jumps to a
 * letter, so a partially loaded list would send "J" somewhere arbitrary. That
 * requirement is why the screen used to ask the API for 10,000 rows on every
 * visit. It still needs the full set; it just does not need the network to
 * supply it, because the directory barely changes between visits.
 */
/**
 * A conversation's category, contact profile and smart cards.
 *
 * Three Supabase round trips ran on every chat open to rebuild something that
 * changes only when the user edits it or Claire learns something new — rarely,
 * and never while the chat is being opened. Reading the last known answer off
 * disk lets the quick-context card render with the transcript instead of
 * arriving a beat behind it.
 */
export async function cachedConversationSettings(userId: string, chatId: string): Promise<Record<string, unknown> | null> {
  if (!isNativeMobile) return null;
  const db = await database(userId);
  if (!db) return null;
  const row = await db.getFirstAsync(
    'SELECT payload FROM cache_conversation_settings WHERE chat_id = ?', chatId,
  ) as { payload?: string } | null;
  if (!row?.payload) return null;
  try {
    return JSON.parse(row.payload) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Merges rather than replaces, because two owners write here: the settings
 * store contributes category/profile/smartCards, and the conversation detail
 * screen contributes the resolved phone number and mute state. A replacing
 * write would let whichever ran last erase the other's half.
 */
export async function cacheConversationSettings(userId: string, chatId: string, settings: Record<string, unknown>): Promise<void> {
  if (!isNativeMobile) return;
  const db = await database(userId);
  if (!db) return;
  const existing = (await cachedConversationSettings(userId, chatId)) || {};
  await db.runAsync(
    'INSERT INTO cache_conversation_settings(chat_id, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(chat_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at',
    chatId, JSON.stringify({ ...existing, ...settings }), new Date().toISOString(),
  );
}

export async function cachedContacts(userId: string): Promise<CachedContact[]> {
  if (!isNativeMobile) return [];
  const db = await database(userId);
  if (!db) return [];
  const rows = await db.getAllAsync(
    'SELECT payload FROM cache_contacts ORDER BY json_extract(payload, "$.name") IS NULL, json_extract(payload, "$.name") COLLATE NOCASE ASC, id ASC',
  ) as Array<{ payload: string }>;
  return rows.map(row => JSON.parse(row.payload) as CachedContact);
}

/**
 * Replace the cached directory with a freshly synced one.
 *
 * A whole-set replace rather than an upsert, because upserting alone can never
 * remove a contact that was deleted upstream — People would accumulate ghosts
 * that no refresh could clear. One transaction so a failure part-way leaves the
 * previous directory intact rather than a half-written one.
 */
export async function replaceCachedContacts(userId: string, contacts: CachedContact[]): Promise<void> {
  if (!isNativeMobile) return;
  const db = await database(userId);
  if (!db) return;
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM cache_contacts');
    const now = new Date().toISOString();
    for (const contact of contacts) {
      if (typeof contact.id !== 'string') continue;
      await db.runAsync(
        'INSERT INTO cache_contacts(id, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at',
        contact.id, JSON.stringify(contact), now,
      );
    }
  });
  await setMeta(userId, db, 'contacts_synced_at', new Date().toISOString());
}

export async function cachedContactsSyncedAt(userId: string): Promise<string | null> {
  if (!isNativeMobile) return null;
  const db = await database(userId);
  if (!db) return null;
  return (await meta(db, 'contacts_synced_at', '')) || null;
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
    await upsert(userId, db, 'cache_chats', chat);
    const latest = chat.latest_message;
    if (latest && typeof latest.id === 'string') await upsert(userId, db, 'cache_messages', { ...latest, chat_id: latest.chat_id || chat.id });
  }
  for (const loop of bootstrap.loops) await upsert(userId, db, 'cache_loops', loop);
  await setMeta(userId, db, 'cursor', String(bootstrap.cursor));
  await setMeta(userId, db, 'last_sync_at', new Date().toISOString());
  await setMeta(userId, db, 'preferences', JSON.stringify(bootstrap.preferences));
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
      await setMeta(userId, db, 'preferences', JSON.stringify(event.payload));
    } else if (table) {
      if (event.operation === 'delete') await db.runAsync(`DELETE FROM ${table} WHERE id = ?`, event.entity_id);
      else if (event.payload) await upsert(userId, db, table, event.payload);
    }
    if (event.entity_type === 'message' && event.payload && typeof event.payload.chat_id === 'string') {
      const fullHistory = await meta(db, 'full_history_enabled', 'false');
      if (fullHistory !== 'true') await trimRecentMessages(db, event.payload.chat_id);
    }
  }
  await setMeta(userId, db, 'cursor', String(cursor));
  await setMeta(userId, db, 'last_sync_at', new Date().toISOString());
}

export async function setFullHistoryEnabled(userId: string, enabled: boolean): Promise<void> {
  if (!isNativeMobile) return;
  const db = await database(userId);
  if (db) await setMeta(userId, db, 'full_history_enabled', String(enabled));
  invalidateSnapshot(userId);
}

export async function clearMobileCache(userId: string): Promise<void> {
  invalidateSnapshot(userId);
  if (!isNativeMobile) return;
  const db = databases.get(userId);
  if (db) await db.closeAsync();
  databases.delete(userId);
  const native = modules();
  await (native?.SQLite as any)?.deleteDatabaseAsync?.(filename(userId));
  await native?.SecureStore.deleteItemAsync(secureKeyName(userId));
}
