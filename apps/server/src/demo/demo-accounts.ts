/**
 * Demo account gate
 *
 * Two independent switches must agree before any demo behaviour runs:
 *
 *   1. `DEMO_MODE_ENABLED` on the deployment, and
 *   2. `users.is_demo` on the individual account.
 *
 * Neither alone does anything. That is the point: the flag can be set on the
 * wrong environment, or the column on the wrong row, without a real account
 * ever getting synthetic sessions or an AI-generated reply from a contact.
 *
 * The lookup sits on the message send path, so it is cached. Demo accounts are
 * created by a seed script and never toggled mid-session, so a short TTL is
 * plenty and a stale negative self-heals within a minute.
 */

import { demoConfig } from '../config';
import { supabase } from '../services/supabase';
import { logger } from '../utils/logger';

const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  isDemo: boolean;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/** True when this deployment has opted into demo behaviour at all. */
export function isDemoModeEnabled(): boolean {
  return demoConfig.enabled;
}

/**
 * Whether this account is a demo account.
 *
 * Fails closed: a database error returns false, so an outage degrades a demo
 * account to an ordinary one rather than exposing demo behaviour to everyone.
 */
export async function isDemoUser(userId: string | undefined | null): Promise<boolean> {
  if (!demoConfig.enabled || !userId) return false;

  const cached = cache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.isDemo;
  }

  const { data, error } = await supabase
    .from('users')
    .select('is_demo')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    logger.warn('[demo] Could not resolve demo flag; treating account as non-demo', {
      errorCode: error.code || 'demo_flag_read_failed',
    });
    return false;
  }

  const isDemo = data?.is_demo === true;
  cache.set(userId, { isDemo, expiresAt: Date.now() + CACHE_TTL_MS });
  return isDemo;
}

/** Drop cached decisions. Used by the seed script after flipping the flag. */
export function resetDemoAccountCache(userId?: string): void {
  if (userId) cache.delete(userId);
  else cache.clear();
}
