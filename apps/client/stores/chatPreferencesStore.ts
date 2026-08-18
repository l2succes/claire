import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PLUS_DEFAULT_KEY = 'claire.chat.plusDefault';
const LOOP_DETECTION_KEY = 'claire.settings.loopDetection';
/**
 * Pre-rename key. Read once on hydrate so a user who turned detection OFF does
 * not silently have it turned back on by the rename.
 */
const LEGACY_LOOP_DETECTION_KEY = 'claire.settings.promiseDetection';

export type ChatPlusDefault = 'menu' | 'reply-options';

interface ChatPreferencesState {
  plusDefault: ChatPlusDefault;
  loopDetection: boolean;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setPlusDefault: (value: ChatPlusDefault) => Promise<void>;
  setLoopDetection: (value: boolean) => Promise<void>;
}

export const useChatPreferencesStore = create<ChatPreferencesState>((set, get) => ({
  plusDefault: 'menu',
  loopDetection: true,
  hydrated: false,
  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const [stored, detection, legacyDetection] = await Promise.all([
        AsyncStorage.getItem(PLUS_DEFAULT_KEY),
        AsyncStorage.getItem(LOOP_DETECTION_KEY),
        AsyncStorage.getItem(LEGACY_LOOP_DETECTION_KEY),
      ]);

      // Migrate the pre-rename key on first hydrate. Without this, anyone who
      // had disabled detection would find it re-enabled after updating.
      const resolved = detection ?? legacyDetection;
      if (detection === null && legacyDetection !== null) {
        await AsyncStorage.setItem(LOOP_DETECTION_KEY, legacyDetection);
        await AsyncStorage.removeItem(LEGACY_LOOP_DETECTION_KEY);
      }

      set({
        plusDefault: stored === 'menu' || stored === 'reply-options' ? stored : 'menu',
        loopDetection: resolved !== '0',
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
  setLoopDetection: async (loopDetection) => {
    set({ loopDetection });
    try {
      await AsyncStorage.setItem(LOOP_DETECTION_KEY, loopDetection ? '1' : '0');
    } catch {
      // Local preference only; a failed write still applies for this session.
    }
  },
}));
