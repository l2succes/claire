import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabase';
import { API_BASE_URL } from '../services/platforms';

const PLUS_DEFAULT_KEY = 'claire.chat.plusDefault';
/**
 * Last value read from or written to `user_preferences.loop_detection_enabled`,
 * stored with the account it belongs to. Only a paint-ahead cache: the server
 * column is what the loop detector gates on, so it always wins once loaded.
 */
const LOOP_DETECTION_CACHE_KEY = 'claire.settings.loopDetection.server';
/**
 * The switch used to be local-only and never reached the server. These keys
 * hold that old value (the second is the pre-rename name). They are read once
 * after the server value loads so a user who turned detection OFF on the device
 * gets it turned off where it actually takes effect, then removed.
 */
const LEGACY_LOOP_DETECTION_KEYS = ['claire.settings.loopDetection', 'claire.settings.promiseDetection'];

export type ChatPlusDefault = 'menu' | 'reply-options';

/** Where the displayed `loopDetection` value came from. */
export type LoopDetectionSource = 'none' | 'cache' | 'server';

interface ChatPreferencesState {
  plusDefault: ChatPlusDefault;
  loopDetection: boolean;
  loopDetectionSource: LoopDetectionSource;
  loopDetectionLoading: boolean;
  /** Account the loop detection value belongs to, so a sign-in switch never shows another user's value. */
  loopDetectionUserId: string | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setPlusDefault: (value: ChatPlusDefault) => Promise<void>;
  loadLoopDetection: () => Promise<void>;
  /** Optimistic; reverts and rethrows if the server rejects the write. */
  setLoopDetection: (value: boolean) => Promise<void>;
}

type Session = { access_token: string; user: { id: string } };

async function currentSession(): Promise<Session | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token && session.user?.id ? session : null;
  } catch {
    return null;
  }
}

/**
 * The server always reports the column (defaulting a missing row to true, as
 * the detector does). A response without it comes from a server that predates
 * the field and silently ignores writes to it, so it must not read as success.
 */
function readLoopDetectionField(body: { data?: { loop_detection_enabled?: unknown } }): boolean {
  const value = body?.data?.loop_detection_enabled;
  if (typeof value !== 'boolean') throw new Error('Server does not support loop_detection_enabled');
  return value;
}

async function fetchLoopDetection(token: string): Promise<boolean> {
  const res = await fetch(`${API_BASE_URL}/preferences`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to fetch preferences');
  return readLoopDetectionField(await res.json());
}

async function saveLoopDetection(token: string, enabled: boolean): Promise<boolean> {
  const res = await fetch(`${API_BASE_URL}/preferences`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ loop_detection_enabled: enabled }),
  });
  if (!res.ok) throw new Error('Failed to save preferences');
  return readLoopDetectionField(await res.json());
}

async function readCache(userId: string): Promise<boolean | null> {
  try {
    const raw = await AsyncStorage.getItem(LOOP_DETECTION_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as { userId?: unknown; enabled?: unknown };
    return cached.userId === userId && typeof cached.enabled === 'boolean' ? cached.enabled : null;
  } catch {
    return null;
  }
}

async function writeCache(userId: string, enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(LOOP_DETECTION_CACHE_KEY, JSON.stringify({ userId, enabled }));
  } catch {
    // Cache only; the server already has the value.
  }
}

/** The old local-only value, or null if this device never stored one. */
async function readLegacy(): Promise<boolean | null> {
  try {
    const [current, preRename] = await Promise.all(LEGACY_LOOP_DETECTION_KEYS.map((key) => AsyncStorage.getItem(key)));
    const value = current ?? preRename;
    return value === null ? null : value !== '0';
  } catch {
    return null;
  }
}

async function clearLegacy(): Promise<void> {
  try {
    await Promise.all(LEGACY_LOOP_DETECTION_KEYS.map((key) => AsyncStorage.removeItem(key)));
  } catch {
    // Retried on the next load; harmless once the server has an explicit value.
  }
}

// Bumped by every write so a load that started earlier cannot overwrite the
// value the user just chose with the one the server had before their tap.
let writeSeq = 0;
let inflightLoad: Promise<void> | null = null;

export const useChatPreferencesStore = create<ChatPreferencesState>((set, get) => ({
  plusDefault: 'menu',
  loopDetection: true,
  loopDetectionSource: 'none',
  loopDetectionLoading: false,
  loopDetectionUserId: null,
  hydrated: false,
  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const stored = await AsyncStorage.getItem(PLUS_DEFAULT_KEY);
      set({
        plusDefault: stored === 'menu' || stored === 'reply-options' ? stored : 'menu',
        hydrated: true,
      });
    } catch {
      set({ hydrated: true });
    }
  },
  setPlusDefault: async (plusDefault) => {
    set({ plusDefault });
    try {
      await AsyncStorage.setItem(PLUS_DEFAULT_KEY, plusDefault);
    } catch {
      // Local preference only; a failed write still applies for this session.
    }
  },
  loadLoopDetection: () => {
    inflightLoad ??= (async () => {
      const session = await currentSession();
      if (!session) return;
      const userId = session.user.id;

      if (get().loopDetectionUserId !== userId) {
        set({ loopDetection: true, loopDetectionSource: 'none', loopDetectionUserId: userId });
      }
      if (get().loopDetectionSource === 'none') {
        const cached = await readCache(userId);
        if (cached !== null) set({ loopDetection: cached, loopDetectionSource: 'cache' });
      }

      set({ loopDetectionLoading: true });
      const seq = writeSeq;
      try {
        let enabled = await fetchLoopDetection(session.access_token);

        // Only an explicit local OFF is carried over. A local ON was the old
        // default more often than a choice, and must not re-enable detection
        // for an account that disabled it on the server.
        const legacy = await readLegacy();
        if (legacy === false && enabled) enabled = await saveLoopDetection(session.access_token, false);
        if (legacy !== null) await clearLegacy();

        if (seq !== writeSeq || get().loopDetectionUserId !== userId) return;
        set({ loopDetection: enabled, loopDetectionSource: 'server' });
        await writeCache(userId, enabled);
      } catch {
        // Keep whatever is displayed (cache or nothing); the screen reflects the source.
      } finally {
        set({ loopDetectionLoading: false });
      }
    })().finally(() => {
      inflightLoad = null;
    });
    return inflightLoad;
  },
  setLoopDetection: async (loopDetection) => {
    const { loopDetection: previous, loopDetectionSource: previousSource } = get();
    const seq = ++writeSeq;
    set({ loopDetection });
    try {
      const session = await currentSession();
      if (!session) throw new Error('Not signed in');
      const saved = await saveLoopDetection(session.access_token, loopDetection);
      // An explicit server-side choice supersedes the old local value for good.
      await clearLegacy();
      await writeCache(session.user.id, saved);
      if (seq === writeSeq) set({ loopDetection: saved, loopDetectionSource: 'server', loopDetectionUserId: session.user.id });
    } catch (error) {
      if (seq === writeSeq) set({ loopDetection: previous, loopDetectionSource: previousSource });
      throw error;
    }
  },
}));
