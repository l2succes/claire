import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import { platformCapabilities } from '../utils/platformCapabilities';

/**
 * A row from an untyped Supabase query.
 *
 * There is no generated `Database` type, so `supabase.from(...).select()`
 * resolves `data` to `any` rather than an array. Callbacks passed to
 * `data.map(...)` get no contextual type and trip `noImplicitAny`, so row
 * callbacks annotate their parameter with this alias.
 */
export type DbRow = Record<string, any>;

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: platformCapabilities.isWeb,
    flowType: platformCapabilities.isWeb ? 'implicit' : 'pkce',
  },
});

// Supabase does not automatically run refresh timers while a React Native app
// is backgrounded. Resume them explicitly when Claire returns to foreground so
// a previously valid session is not sent to the API after its short-lived JWT
// has expired.
if (Platform.OS !== 'web') {
  const syncAuthRefresh = (state: string) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  };

  syncAuthRefresh(AppState.currentState);
  AppState.addEventListener('change', syncAuthRefresh);
}
