import { create } from 'zustand';
import { supabase } from '../services/supabase';
import { API_BASE_URL } from '../services/platforms';
import type { ChatCategory, ContactProfile, SmartCard } from '../types/conversationSettings';

interface ChatSettings {
  category: ChatCategory | null;
  profile: ContactProfile | null;
  smartCards: SmartCard[];
  isLoading: boolean;
}

interface ConversationSettingsState {
  settings: Record<string, ChatSettings>;

  fetchSettings: (chatId: string) => Promise<void>;
  setCategory: (chatId: string, userId: string, category: ChatCategory) => Promise<void>;
  updateProfile: (chatId: string, userId: string, updates: Partial<Pick<ContactProfile, 'display_name' | 'email' | 'phone_number' | 'location'>>) => Promise<void>;
  dismissCard: (chatId: string, cardId: string) => Promise<void>;
  markCardActed: (chatId: string, cardId: string) => Promise<void>;
  generateSmartCards: (chatId: string) => Promise<void>;
  refreshInsights: (chatId: string) => Promise<void>;
}

const defaultSettings: ChatSettings = {
  category: null,
  profile: null,
  smartCards: [],
  isLoading: false,
};

export const useConversationSettingsStore = create<ConversationSettingsState>((set, get) => ({
  settings: {},

  fetchSettings: async (chatId: string) => {
    set((state) => ({
      settings: {
        ...state.settings,
        [chatId]: { ...(state.settings[chatId] || defaultSettings), isLoading: true },
      },
    }));

    try {
      const [categoryRes, profileRes, cardsRes] = await Promise.all([
        supabase
          .from('chat_categories')
          .select('*')
          .eq('chat_id', chatId)
          .maybeSingle(),
        supabase
          .from('contact_profiles')
          .select('*')
          .eq('chat_id', chatId)
          .maybeSingle(),
        supabase
          .from('smart_cards')
          .select('*')
          .eq('chat_id', chatId)
          .eq('dismissed', false)
          .order('priority', { ascending: false }),
      ]);

      set((state) => ({
        settings: {
          ...state.settings,
          [chatId]: {
            category: categoryRes.data?.category ?? null,
            profile: profileRes.data ?? null,
            smartCards: cardsRes.data ?? [],
            isLoading: false,
          },
        },
      }));
    } catch (err) {
      console.error('Failed to fetch conversation settings:', err);
      set((state) => ({
        settings: {
          ...state.settings,
          [chatId]: { ...(state.settings[chatId] || defaultSettings), isLoading: false },
        },
      }));
    }
  },

  setCategory: async (chatId: string, userId: string, category: ChatCategory) => {
    // Optimistic update
    set((state) => ({
      settings: {
        ...state.settings,
        [chatId]: { ...(state.settings[chatId] || defaultSettings), category },
      },
    }));

    const { error } = await supabase
      .from('chat_categories')
      .upsert(
        { user_id: userId, chat_id: chatId, category, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,chat_id' }
      );

    if (error) {
      console.error('Failed to set category:', error);
      // Revert on failure
      get().fetchSettings(chatId);
    }
  },

  updateProfile: async (chatId: string, userId: string, updates: Partial<Pick<ContactProfile, 'display_name' | 'email' | 'phone_number' | 'location'>>) => {
    // Optimistic update
    set((state) => {
      const current = state.settings[chatId] || defaultSettings;
      return {
        settings: {
          ...state.settings,
          [chatId]: {
            ...current,
            profile: current.profile
              ? { ...current.profile, ...updates }
              : { id: '', user_id: userId, contact_id: null, chat_id: chatId, display_name: null, email: null, phone_number: null, location: null, key_facts: [], relationship_context: null, created_at: '', updated_at: '', ...updates } as ContactProfile,
          },
        },
      };
    });

    const { error } = await supabase
      .from('contact_profiles')
      .upsert(
        { user_id: userId, chat_id: chatId, ...updates, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,chat_id' }
      );

    if (error) {
      console.error('Failed to update profile:', error);
      get().fetchSettings(chatId);
    }
  },

  dismissCard: async (chatId: string, cardId: string) => {
    // Optimistic update
    set((state) => {
      const current = state.settings[chatId] || defaultSettings;
      return {
        settings: {
          ...state.settings,
          [chatId]: {
            ...current,
            smartCards: current.smartCards.filter((c) => c.id !== cardId),
          },
        },
      };
    });

    const { error } = await supabase
      .from('smart_cards')
      .update({ dismissed: true })
      .eq('id', cardId);

    if (error) {
      console.error('Failed to dismiss card:', error);
      get().fetchSettings(chatId);
    }
  },

  markCardActed: async (chatId: string, cardId: string) => {
    set((state) => {
      const current = state.settings[chatId] || defaultSettings;
      return {
        settings: {
          ...state.settings,
          [chatId]: {
            ...current,
            smartCards: current.smartCards.filter((c) => c.id !== cardId),
          },
        },
      };
    });

    const { error } = await supabase
      .from('smart_cards')
      .update({ acted_on: true })
      .eq('id', cardId);

    if (error) {
      console.error('Failed to mark card acted:', error);
    }
  },

  generateSmartCards: async (chatId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${API_BASE_URL}/conversations/${chatId}/smart-cards`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
      });
      const json = await res.json();
      if (json.success && json.data) {
        set((state) => ({
          settings: {
            ...state.settings,
            [chatId]: {
              ...(state.settings[chatId] || defaultSettings),
              smartCards: json.data,
            },
          },
        }));
      }
    } catch (err) {
      console.error('Failed to generate smart cards:', err);
    }
  },

  refreshInsights: async (chatId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${API_BASE_URL}/conversations/${chatId}/refresh-insights`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
      });
      const json = await res.json();
      if (json.success && json.data) {
        set((state) => ({
          settings: {
            ...state.settings,
            [chatId]: {
              ...(state.settings[chatId] || defaultSettings),
              profile: json.data,
            },
          },
        }));
      }
    } catch (err) {
      console.error('Failed to refresh insights:', err);
    }
  },
}));
