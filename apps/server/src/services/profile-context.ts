import type { Request } from 'express';
import { supabase } from './supabase';

export const PROFILE_HEADER = 'x-claire-profile-id';

/**
 * Resolve a user-owned workspace from an HTTP request.  Profile IDs are never
 * trusted just because a client supplied one: every scoped route uses this
 * helper before reading or mutating profile data.
 */
export async function resolveProfileId(req: Request, userId: string): Promise<string | null> {
  const requested = req.get(PROFILE_HEADER)?.trim();
  if (requested) {
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', requested)
      .eq('user_id', userId)
      .maybeSingle();
    return data?.id ?? null;
  }

  const { data, error } = await supabase.rpc('ensure_personal_profile', { target_user_id: userId });
  if (error || typeof data !== 'string') return null;
  return data;
}

export function profileScopeError() {
  return { error: 'Profile not found or not owned by this account' };
}
