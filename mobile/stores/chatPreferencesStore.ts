import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PLUS_DEFAULT_KEY = 'claire.chat.plusDefault';
const PROMISE_DETECTION_KEY = 'claire.settings.promiseDetection';

export type ChatPlusDefault = 'menu' | 'reply-options';

interface ChatPreferencesState {
  plusDefault: ChatPlusDefault;
  promiseDetection: boolean;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setPlusDefault: (value: ChatPlusDefault) => Promise<void>;
  setPromiseDetection: (value: boolean) => Promise<void>;
}

export const useChatPreferencesStore = create<ChatPreferencesState>((set, get) => ({
  plusDefault: 'menu',
  promiseDetection: true,
  hydrated: false,
  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const [stored, detection] = await Promise.all([
        AsyncStorage.getItem(PLUS_DEFAULT_KEY),
        AsyncStorage.getItem(PROMISE_DETECTION_KEY),
      ]);
      set({
        plusDefault: stored === 'menu' || stored === 'reply-options' ? stored : 'menu',
        promiseDetection: detection !== '0',
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
  setPromiseDetection: async (promiseDetection) => {
    set({ promiseDetection });
    try {
      await AsyncStorage.setItem(PROMISE_DETECTION_KEY, promiseDetection ? '1' : '0');
    } catch {
      // Local preference only; a failed write still applies for this session.
    }
  },
}));
