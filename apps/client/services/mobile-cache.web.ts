/**
 * Web intentionally remains network-first. Do not add message persistence here:
 * browser storage is not an appropriate cache for private conversation bodies.
 */
export type CachedChat = Record<string, unknown> & {
  id: string;
  latest_message?: Record<string, unknown> | null;
};

export type CachedMessage = {
  id: string;
  chat_id: string;
  timestamp: string;
  [key: string]: unknown;
};

export type MobileCacheSnapshot = {
  chats: CachedChat[];
  messages: CachedMessage[];
  promises: Record<string, unknown>[];
  preferences: Record<string, unknown> | null;
  cursor: number | null;
  fullHistoryEnabled: boolean;
  lastSyncAt: string | null;
};

const emptySnapshot = (): MobileCacheSnapshot => ({
  chats: [],
  messages: [],
  promises: [],
  preferences: null,
  cursor: null,
  fullHistoryEnabled: false,
  lastSyncAt: null,
});

export function usesNativeMobileCache() {
  return false;
}

export async function hydrateMobileCache(_userId: string): Promise<MobileCacheSnapshot> {
  return emptySnapshot();
}

export async function cachedTimeline(_userId: string, _chatId: string, _limit = 200): Promise<CachedMessage[]> {
  return [];
}

export async function cacheTimeline<T extends { id: string; chat_id: string; timestamp: string }>(_userId: string, _chatId: string, _messages: T[]): Promise<void> {}

export async function oldestCachedMessage(_userId: string, _chatId: string): Promise<{ timestamp: string; id: string } | null> {
  return null;
}

export async function cacheBootstrap(_userId: string, _bootstrap: { cursor: number; chats: CachedChat[]; promises: Record<string, unknown>[]; preferences: Record<string, unknown> | null }): Promise<void> {}

export async function applyMobileSyncEvents(_userId: string, _events: unknown[], _cursor: number): Promise<void> {}

export async function setFullHistoryEnabled(_userId: string, _enabled: boolean): Promise<void> {}

export async function clearMobileCache(_userId: string): Promise<void> {}
