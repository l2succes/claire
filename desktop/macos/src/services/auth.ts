import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { Linking } from 'react-native';
import { companionBridge, type DesktopRuntimeConfig } from '../native/CompanionBridge';

// Supabase stores the session and several PKCE verifier entries separately.
// Keep all of those logical entries inside one encrypted Keychain item: the
// native module deliberately exposes only this limited account to JavaScript.
const SESSION_STORE_KEY = 'supabase.session.claire-desktop';
const CALLBACK_URL = 'clairedesktop://auth/callback';

type SecureAuthStore = Record<string, string>;

let secureStore: SecureAuthStore | null = null;

async function loadSecureStore(): Promise<SecureAuthStore> {
  if (secureStore) return secureStore;
  const raw = await companionBridge.getSecureValue(SESSION_STORE_KEY);
  if (!raw) return (secureStore = {});
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      secureStore = Object.fromEntries(
        Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
      );
      return secureStore;
    }
  } catch {
    // Older desktop builds stored one value directly. It cannot safely be
    // interpreted as a complete Supabase store, so start a clean PKCE store.
  }
  return (secureStore = {});
}

async function persistSecureStore(store: SecureAuthStore): Promise<void> {
  await companionBridge.setSecureValue(SESSION_STORE_KEY, JSON.stringify(store));
}

export type DesktopAuth = {
  client: SupabaseClient;
  config: DesktopRuntimeConfig;
};

function configured(value: string | undefined): string {
  return value && !value.includes('$(') ? value.trim() : '';
}

export async function createDesktopAuth(initialConfig?: DesktopRuntimeConfig): Promise<DesktopAuth | null> {
  console.log('[Claire Desktop] Loading runtime configuration', { source: initialConfig ? 'initial-props' : 'native-module' });
  const rawConfig = initialConfig ?? await companionBridge.getRuntimeConfig();
  const config = {
    apiUrl: configured(rawConfig.apiUrl),
    supabaseUrl: configured(rawConfig.supabaseUrl),
    supabaseAnonKey: configured(rawConfig.supabaseAnonKey),
  };
  if (!config.apiUrl || !config.supabaseUrl || !config.supabaseAnonKey) {
    console.warn('[Claire Desktop] Runtime configuration is incomplete');
    return null;
  }

  const client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      storage: {
        getItem: async (key: string) => (await loadSecureStore())[key] ?? null,
        setItem: async (key: string, value: string) => {
          const store = await loadSecureStore();
          store[key] = value;
          await persistSecureStore(store);
        },
        removeItem: async (key: string) => {
          const store = await loadSecureStore();
          delete store[key];
          await persistSecureStore(store);
        },
      },
      storageKey: SESSION_STORE_KEY,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  });
  console.log('[Claire Desktop] Runtime configuration loaded');
  return { client, config };
}

export async function signInWithGoogle(client: SupabaseClient): Promise<void> {
  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: CALLBACK_URL, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data.url) throw new Error('Google sign-in did not return an authorization URL.');
  await Linking.openURL(data.url);
}

export async function exchangeDesktopCallback(client: SupabaseClient, url: string): Promise<Session | null> {
  // OAuth providers can return an error in either the query string or hash.
  // Parse both forms so the sign-in screen can surface a useful recovery
  // message instead of silently returning to the signed-out state.
  const query = url.includes('?') ? url.slice(url.indexOf('?') + 1).split('#', 1)[0] : '';
  const fragment = url.includes('#') ? url.slice(url.indexOf('#') + 1) : '';
  const valueFrom = (source: string, key: string): string | null => {
    for (const entry of source.split('&')) {
      const [rawKey, ...rawValue] = entry.split('=');
      if (rawKey !== key) continue;
      try {
        return decodeURIComponent(rawValue.join('=').replace(/\+/g, ' '));
      } catch {
        return rawValue.join('=');
      }
    }
    return null;
  };
  const valueFor = (key: string) => valueFrom(query, key) ?? valueFrom(fragment, key);

  const oauthError = valueFor('error');
  if (oauthError) {
    throw new Error(valueFor('error_description') || valueFor('error_code') || oauthError);
  }

  const code = valueFor('code');
  if (!code) return null;
  const { data, error } = await client.auth.exchangeCodeForSession(code);
  if (error) throw error;
  return data.session;
}
