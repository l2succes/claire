import type { DesktopChat, DesktopMessage, DesktopPreferences, DesktopLoop } from './claire-api';
import { companionBridge } from '../native/CompanionBridge';

export type DesktopCacheSnapshot = {
  version: 2;
  cursor: number;
  chats: DesktopChat[];
  loops: DesktopLoop[];
  preferences: DesktopPreferences | null;
  timelines: Record<string, DesktopMessage[]>;
  lastChatId: string | null;
  fullHistoryEnabled: boolean;
  savedAt: string;
};

const emptySnapshot = (): DesktopCacheSnapshot => ({ version: 2, cursor: 0, chats: [], loops: [], preferences: null, timelines: {}, lastChatId: null, fullHistoryEnabled: false, savedAt: new Date(0).toISOString() });

/**
 * The native bridge stores this one snapshot in SQLCipher. Keeping the
 * serialization here lets JS safely fall back to memory in a fresh dev build
 * before CocoaPods has installed SQLCipher, without persisting private text.
 */
export class DesktopCache {
  private memory = emptySnapshot();
  private writeTimer: ReturnType<typeof setTimeout> | null = null;

  async hydrate(userId: string): Promise<DesktopCacheSnapshot> {
    try {
      const raw = await companionBridge.readEncryptedCache(userId);
      if (!raw) return this.memory;
      const parsed = JSON.parse(raw) as Partial<DesktopCacheSnapshot>;
      // Bumped to 2 with the loops rename. A v1 snapshot uses the old key name
      // and status vocabulary, so it is discarded rather than migrated —
      // without this an existing install renders an empty Loops pane against
      // stale data and reports no error.
      if (parsed.version !== 2 || !Array.isArray(parsed.chats) || !parsed.timelines) return this.memory;
      this.memory = { ...emptySnapshot(), ...parsed, timelines: parsed.timelines || {} };
    } catch {
      // The first debug build before pod install deliberately remains memory
      // only. Do not route private message bodies into UserDefaults instead.
    }
    return this.memory;
  }

  snapshot(): DesktopCacheSnapshot { return this.memory; }

  update(change: Partial<DesktopCacheSnapshot>): DesktopCacheSnapshot {
    this.memory = { ...this.memory, ...change, savedAt: new Date().toISOString() };
    return this.memory;
  }

  rememberTimeline(chatId: string, messages: DesktopMessage[]): DesktopCacheSnapshot {
    const existing = this.memory.timelines[chatId] || [];
    const byId = new Map<string, DesktopMessage>();
    [...existing, ...messages].forEach((message) => byId.set(message.id, message));
    const merged = [...byId.values()].sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
    return this.update({
      timelines: {
        ...this.memory.timelines,
        [chatId]: this.memory.fullHistoryEnabled ? merged : merged.slice(-200),
      },
      lastChatId: chatId,
    });
  }

  schedulePersist(userId: string): void {
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      companionBridge.writeEncryptedCache(userId, JSON.stringify(this.memory)).catch(() => undefined);
    }, 500);
  }

  async clear(userId: string): Promise<void> {
    if (this.writeTimer) { clearTimeout(this.writeTimer); this.writeTimer = null; }
    this.memory = emptySnapshot();
    await companionBridge.clearEncryptedCache(userId);
  }
}
