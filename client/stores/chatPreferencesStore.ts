import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PLUS_DEFAULT_KEY = 'claire.chat.plusDefault';

export type ChatPlusDefault = 'menu' | 'reply-options';

interface ChatPreferencesState {
  plusDefault: ChatPlusDefault;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setPlusDefault: (value: ChatPlusDefault) => Promise<void>;
}

export const useChatPreferencesStore = create<ChatPreferencesState>((set, get) => ({
  plusDefault: 'menu',
  hydrated: false,
  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const stored = await AsyncStorage.getItem(PLUS_DEFAULT_KEY);
      if (stored === 'menu' || stored === 'reply-options') set({ plusDefault: stored, hydrated: true });
      else set({ hydrated: true });
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
}));
