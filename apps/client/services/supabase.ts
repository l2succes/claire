import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
