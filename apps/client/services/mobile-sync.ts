import { API_BASE_URL } from './platforms';
import { InteractionManager } from 'react-native';
import {
  applyMobileSyncEvents,
  cacheBootstrap,
  cacheTimeline,
  cachedCursor,
  cachedMessageCount,
  hydrateMobileCache,
  oldestCachedMessage,
  usesNativeMobileCache,
  type CachedChat,
  type CachedMessage,
} from './mobile-cache';

type Bootstrap = {
  cursor: number;
  chats: CachedChat[];
  loops: Record<string, unknown>[];
  preferences: Record<string, unknown> | null;
};

type SyncEvent = {
  cursor: number;
  entity_type: 'chat' | 'message' | 'loop' | 'contact' | 'preference';
  entity_id: string;
  operation: 'upsert' | 'delete';
  payload: Record<string, unknown> | null;
};

type SyncPage = { events: SyncEvent[]; cursor: number; hasMore: boolean };

async function request<T>(token: string, path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL.replace(/\/$/, '')}${path}`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Local sync request failed (${response.status})`);
  return response.json() as Promise<T>;
}

/**
 * Reconciles the encrypted cache without broad inbox polling. The desktop
 * endpoints are intentionally shared: their payloads are user-scoped and
 * platform-neutral despite the historical route name.
 */
export type ReconcileOptions = {
  forceBootstrap?: boolean;
  /** Sync pages to walk in this pass. The remainder is picked up by the next. */
  maxPages?: number;
};

/**
 * Returns true when the server still has events beyond the pages walked here,
 * so a caller staging work knows whether a follow-up pass is worth scheduling.
 */
export async function reconcileMobileCache(
  userId: string,
  token: string,
  options: ReconcileOptions | boolean = {},
): Promise<boolean> {
  if (!usesNativeMobileCache()) return false;
  // The boolean form is the old signature; keep it working for existing callers.
  const { forceBootstrap = false, maxPages = 20 } = typeof options === 'boolean' ? { forceBootstrap: options } : options;
  const snapshot = await hydrateMobileCache(userId);
  if (forceBootstrap || !snapshot.chats.length) {
    const bootstrap = await request<Bootstrap>(token, '/desktop/bootstrap');
    await cacheBootstrap(userId, bootstrap);
  }
  let cursor = await cachedCursor(userId);
  for (let page = 0; page < maxPages; page += 1) {
    const result = await request<SyncPage>(token, `/desktop/sync?cursor=${Math.max(0, cursor)}&limit=500`);
    if (!result.events.length) return false;
    await applyMobileSyncEvents(userId, result.events, result.cursor);
    cursor = result.cursor;
    if (!result.hasMore) return false;
  }
  return true;
}

/**
 * Warm the most recent conversations so a first-ever open has something to
 * paint.
 *
 * Sequential, and it skips chats that already have a usable local timeline.
 * Nine parallel 200-message fetches, each committing its own SQLite
 * transaction, is a burst of contention aimed squarely at the moment the user
 * is waiting for the inbox.
 */
export async function prefetchMobileChatHistory(userId: string, token: string, chatIds: string[]): Promise<void> {
  if (!usesNativeMobileCache()) return;
  for (const chatId of chatIds.slice(0, 9)) {
    try {
      if (await cachedMessageCount(userId, chatId) >= 100) continue;
      const payload = await request<{ messages: CachedMessage[] }>(token, `/messages?chatId=${encodeURIComponent(chatId)}&limit=200`);
      await cacheTimeline(userId, chatId, payload.messages);
    } catch {
      // Warming is best effort and must never surface to the user.
    }
  }
}

/** Resolves once the first screen has painted, or after a fallback deadline. */
function afterFirstPaint(signal: Promise<void>): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      InteractionManager.runAfterInteractions(() => resolve());
    };
    void signal.then(finish);
    // A deep link into a chat may never mount the inbox, so the staged work
    // still has to start on its own.
    setTimeout(finish, FIRST_PAINT_TIMEOUT_MS);
  });
}

const FIRST_PAINT_TIMEOUT_MS = 1_500;

let firstPaintResolve: (() => void) | null = null;
let firstPaint = new Promise<void>((resolve) => { firstPaintResolve = resolve; });

/** Called by the first screen that puts real content on the display. */
export function signalFirstPaint(): void {
  firstPaintResolve?.();
  firstPaintResolve = null;
}

/** Test seam: forget that a paint happened. */
export function resetFirstPaintSignal(): void {
  firstPaint = new Promise<void>((resolve) => { firstPaintResolve = resolve; });
}

/**
 * Cold-start sync, staged so it does not compete with the first paint.
 *
 * This used to run a full bootstrap, up to twenty sync pages, and nine parallel
 * 200-message prefetches the instant a token existed -- all against the same
 * SQLite file the inbox was trying to read to show anything at all. The work
 * still happens; it just happens behind the screen instead of in front of it.
 */
export async function bootstrapMobileCache(userId: string, token: string): Promise<void> {
  if (!usesNativeMobileCache()) return;
  const snapshot = await hydrateMobileCache(userId);

  // Nothing cached: there is no paint to protect, and the bootstrap is the
  // fastest route to content, so do not wait.
  if (!snapshot.chats.length) {
    await reconcileMobileCache(userId, token, { forceBootstrap: true, maxPages: 3 });
  } else {
    await afterFirstPaint(firstPaint);
    const hasMore = await reconcileMobileCache(userId, token, { maxPages: 3 });
    if (hasMore) {
      await afterFirstPaint(Promise.resolve());
      await reconcileMobileCache(userId, token, { maxPages: 20 });
    }
  }

  await afterFirstPaint(Promise.resolve());
  const recentChatIds = [...(await hydrateMobileCache(userId)).chats]
    .sort((left, right) => Date.parse(String(right.last_message_at || 0)) - Date.parse(String(left.last_message_at || 0)))
    .slice(0, 9)
    .map(chat => chat.id);
  await prefetchMobileChatHistory(userId, token, recentChatIds);
}

/** Resumable keyset archive backfill. Re-running it is safe: cached message IDs
 * are upserted and the oldest local row becomes the next server cursor. */
export async function backfillFullMobileHistory(userId: string, token: string, onProgress?: (done: number, total: number) => void): Promise<void> {
  if (!usesNativeMobileCache()) return;
  const snapshot = await hydrateMobileCache(userId);
  let done = 0;
  for (const chat of snapshot.chats) {
    let before = await oldestCachedMessage(userId, chat.id);
    for (let page = 0; page < 100; page += 1) {
      const cursor = before ? `&beforeTimestamp=${encodeURIComponent(before.timestamp)}&beforeId=${encodeURIComponent(before.id)}` : '';
      const payload = await request<{ messages: CachedMessage[] }>(token, `/messages?chatId=${encodeURIComponent(chat.id)}&limit=200${cursor}`);
      if (!payload.messages.length) break;
      await cacheTimeline(userId, chat.id, payload.messages);
      done += payload.messages.length;
      onProgress?.(done, snapshot.chats.length);
      if (payload.messages.length < 200) break;
      const oldest = payload.messages.at(-1);
      if (!oldest || (before && oldest.id === before.id)) break;
      before = { id: oldest.id, timestamp: oldest.timestamp };
    }
  }
}
