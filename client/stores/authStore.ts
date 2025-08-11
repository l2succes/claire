import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabase';

interface User {
  id: string;
  email: string;
  name?: string;
  avatar_url?: string;
}

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  token: string | null;
  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (user: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false,
  isLoading: true,
  user: null,
  token: null,

  initialize: async () => {
    try {
      set({ isLoading: true });
      
      // Check for existing session
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        const user = {
          id: session.user.id,
          email: session.user.email || '',
          name: session.user.user_metadata?.name,
          avatar_url: session.user.user_metadata?.avatar_url,
        };

        set({ 
          isAuthenticated: true, 
          token: session.access_token,
          user,
          isLoading: false 
        });
      } else {
        set({ isLoading: false });
      }

      // Listen to auth changes
      supabase.auth.onAuthStateChange((event, session) => {
        if (session) {
          const user = {
            id: session.user.id,
            email: session.user.email || '',
            name: session.user.user_metadata?.name,
            avatar_url: session.user.user_metadata?.avatar_url,
          };

          set({ 
            isAuthenticated: true, 
            token: session.access_token,
            user,
          });
        } else {
          set({ 
            isAuthenticated: false, 
            token: null, 
            user: null,
          });
        }
      });
    } catch (error) {
      console.error('Auth initialization error:', error);
      set({ isLoading: false });
    }
  },

  login: async (email: string, password: string) => {
    try {
      set({ isLoading: true });
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      if (data.session) {
        // Get user profile
        const { data: profile } = await supabase
          .from('users')
          .select('*')
          .eq('id', data.session.user.id)
          .single();

        const user = {
          id: data.session.user.id,
          email: data.session.user.email || email,
          name: profile?.name,
          avatar_url: profile?.avatar_url,
        };

        set({ 
          isAuthenticated: true, 
          token: data.session.access_token,
          user,
          isLoading: false 
        });
      }
    } catch (error) {
      console.error('Login error:', error);
      set({ isLoading: false });
      throw error;
    }
  },

  signUp: async (email: string, password: string, name?: string) => {
    try {
      set({ isLoading: true });
      
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) throw error;

      if (data.user) {
        // Create user profile
        await supabase.from('users').insert({
          id: data.user.id,
          email,
          name,
        });

        // Auto-login after signup
        if (data.session) {
          const user = {
            id: data.user.id,
            email,
            name,
          };

          set({ 
            isAuthenticated: true, 
            token: data.session.access_token,
            user,
            isLoading: false 
          });
        }
      }
    } catch (error) {
      console.error('Signup error:', error);
      set({ isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    try {
      await supabase.auth.signOut();
      await AsyncStorage.clear();
      set({ 
        isAuthenticated: false, 
        token: null, 
        user: null,
        isLoading: false 
      });
    } catch (error) {
      console.error('Logout error:', error);
    }
  },

  updateUser: (updates: Partial<User>) => {
    const currentUser = get().user;
    if (currentUser) {
      set({ user: { ...currentUser, ...updates } });
    }
  },
}));