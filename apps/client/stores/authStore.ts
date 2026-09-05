import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
import { deregisterNotificationDevice } from '../services/notifications';
import { clearMobileCache } from '../services/mobile-cache';
import { resetQueryClient } from '../services/query-client';
import { usePlatformStore } from './platformStore';
import { appMark } from '../services/perf-marks';

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

function userFromSession(session: Session): User {
  return {
    id: session.user.id,
    email: session.user.email || '',
    name: session.user.user_metadata?.name,
    avatar_url: session.user.user_metadata?.avatar_url,
  };
}

/**
 * Native storage can restore an access token whose refresh timer stopped while
 * iOS suspended Claire, so a restored session is often already stale.
 */
function isExpiringSoon(session: Session): boolean {
  return !session.expires_at || session.expires_at * 1000 <= Date.now() + 60_000;
}

/**
 * Everything this device holds for one account.
 *
 * Sign-out used to clear AsyncStorage and nothing else, so the encrypted
 * message database, its Keychain key, and a live in-memory query cache all
 * survived logout -- only the Privacy screen ever removed them.
 */
let clearingFor: string | null = null;
async function clearLocalUserData(userId: string | undefined): Promise<void> {
  if (userId && clearingFor === userId) return;
  clearingFor = userId ?? null;
  try {
    if (userId) await clearMobileCache(userId).catch(() => undefined);
    resetQueryClient();
    await Promise.resolve(usePlatformStore.persist.clearStorage()).catch(() => undefined);
    await AsyncStorage.clear();
  } finally {
    clearingFor = null;
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false,
  isLoading: true,
  user: null,
  token: null,

  initialize: async () => {
    try {
      set({ isLoading: true });

      // Paint from the stored session, refresh behind it.
      //
      // This awaited a token refresh before anything could render: the root
      // layout holds the launch reveal until `initialized`, and the index route
      // renders null while `isLoading`, so a cold start with an expired token
      // waited on a network round trip before the first screen even mounted --
      // measured at about 3.6s on a release build. The identity in the stored
      // session is what screens need to read their cache; the fresh token is
      // only needed by the requests that follow, and every consumer already
      // gets one lazily (`currentAccessToken` refreshes per request, and the
      // response interceptor retries a 401 once).
      appMark('auth-read-start');
      const { data: { session: stored } } = await supabase.auth.getSession();
      appMark('auth-read-end');

      if (stored) {
        set({
          isAuthenticated: true,
          token: stored.access_token,
          user: userFromSession(stored),
          isLoading: false,
        });

        if (isExpiringSoon(stored)) {
          // Not awaited. When it lands, the token in the store changes and the
          // effects keyed on it re-run with the fresh one.
          void supabase.auth.refreshSession()
            .then(({ data, error }) => {
              if (error || !data.session) return;
              appMark('auth-refreshed');
              set({
                isAuthenticated: true,
                token: data.session.access_token,
                user: userFromSession(data.session),
              });
            })
            .catch(() => undefined);
        }
      } else {
        set({ isLoading: false });
      }

      // Listen to auth changes
      supabase.auth.onAuthStateChange((event, session) => {
        if (session) {
          set({ 
            isAuthenticated: true, 
            token: session.access_token,
            user: userFromSession(session),
          });
        } else {
          const previousUserId = get().user?.id;
          set({ 
            isAuthenticated: false, 
            token: null, 
            user: null,
          });
          // Only a real sign-out wipes local data. A refresh that fails while
          // the device is offline also arrives here with no session, and
          // deleting the encrypted cache in that moment would destroy exactly
          // the data the user needs to keep reading while disconnected.
          const signedOut = event === 'SIGNED_OUT';
          if (signedOut && previousUserId) void clearLocalUserData(previousUserId);
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
      const accessToken = get().token;
      const userId = get().user?.id;
      if (accessToken) await deregisterNotificationDevice(accessToken).catch(() => undefined);
      await supabase.auth.signOut();
      await clearLocalUserData(userId);
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
