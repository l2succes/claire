import { API_BASE_URL } from './platforms';
import {
  applyMobileSyncEvents,
  cacheBootstrap,
  cacheTimeline,
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
export async function reconcileMobileCache(userId: string, token: string, forceBootstrap = false): Promise<void> {
  if (!usesNativeMobileCache()) return;
  const snapshot = await hydrateMobileCache(userId);
  if (forceBootstrap || !snapshot.chats.length) {
    const bootstrap = await request<Bootstrap>(token, '/desktop/bootstrap');
    await cacheBootstrap(userId, bootstrap);
  }
  let cursor = (await hydrateMobileCache(userId)).cursor ?? 0;
  for (let page = 0; page < 20; page += 1) {
    const result = await request<SyncPage>(token, `/desktop/sync?cursor=${Math.max(0, cursor)}&limit=500`);
    if (!result.events.length) break;
    await applyMobileSyncEvents(userId, result.events, result.cursor);
    cursor = result.cursor;
    if (!result.hasMore) break;
  }
}

export async function prefetchMobileChatHistory(userId: string, token: string, chatIds: string[]): Promise<void> {
  if (!usesNativeMobileCache()) return;
  await Promise.all(chatIds.slice(0, 9).map(async (chatId) => {
    const payload = await request<{ messages: CachedMessage[] }>(token, `/messages?chatId=${encodeURIComponent(chatId)}&limit=200`);
    await cacheTimeline(userId, chatId, payload.messages);
  }));
}

export async function bootstrapMobileCache(userId: string, token: string): Promise<void> {
  if (!usesNativeMobileCache()) return;
  await reconcileMobileCache(userId, token);
  const snapshot = await hydrateMobileCache(userId);
  const recentChatIds = snapshot.chats
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
