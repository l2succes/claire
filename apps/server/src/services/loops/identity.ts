/**
 * Who is the user, in the terms a bridge renders them?
 *
 * Every relevance signal that ties a message to the user runs through this:
 * mentions, self-commitment, named-other. Getting it wrong does not degrade
 * gracefully — `self_commitment` is a hard pass, so a missed alias means a
 * commitment the user made in their own words silently opens no loop.
 *
 * Keyed by (userId, platform, accountRef), NOT by userId alone. On Slack the
 * same human has a different user id in every workspace, so an account-scoped
 * cache is the difference between working and silently failing there.
 *
 * See /docs/plans/loops-revamp §6.
 */

import { loopSemanticsFor } from '@claire/platform-catalog';

import { logger } from '../../utils/logger';
import { supabase } from '../supabase';
import { normalizeAlias, normalizePhone, type SelfIdentity } from './relevance';

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  identity: SelfIdentity;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(userId: string, platform: string, accountRef?: string | null): string {
  // selfIdentityScope: 'workspace' platforms must not share an entry across
  // accounts. For 'account' platforms the ref is ignored so every chat on the
  // platform reuses one entry.
  const scope = loopSemanticsFor(platform).selfIdentityScope;
  return scope === 'workspace' ? `${userId}:${platform}:${accountRef ?? 'default'}` : `${userId}:${platform}`;
}

/** Drop cached identities. Tests, and after a user renames themselves. */
export function resetIdentityCache(): void {
  cache.clear();
}

/**
 * Split a display name into the aliases a message might use.
 *
 * "Luc Succes" has to match "Luc", because that is what people type in group
 * chats. Single-letter fragments are dropped — matching "A" would fire on
 * almost anything.
 */
function nameAliases(name: string | null | undefined): string[] {
  if (!name) return [];
  const parts = name.split(/\s+/).filter((part) => part.length > 1);
  const aliases = [name, ...parts].map(normalizeAlias).filter((alias) => alias.length > 1);
  return [...new Set(aliases)];
}

/** The local-part of an email, which is often the handle on work platforms. */
function emailHandle(email: string | null | undefined): string[] {
  if (!email) return [];
  const local = email.split('@')[0];
  if (!local || local.length < 2) return [];
  // Split on separators too: "luc.succes" should also match "luc".
  const parts = local.split(/[._-]+/).filter((part) => part.length > 1);
  return [...new Set([local, ...parts].map(normalizeAlias).filter((alias) => alias.length > 1))];
}

/**
 * Resolve the user's identity on a platform.
 *
 * Returns an empty-but-valid identity rather than throwing when lookups fail:
 * a detection pass with a weak identity is far better than no detection at all,
 * and the relevance signals degrade to "no self signal" rather than misfiring.
 */
export async function resolveSelfIdentity(
  userId: string,
  platform: string,
  accountRef?: string | null,
): Promise<SelfIdentity> {
  const key = cacheKey(userId, platform, accountRef);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.identity;

  const displayNames = new Set<string>();
  const handles = new Set<string>();
  const phones = new Set<string>();
  const contactIds = new Set<string>();

  try {
    const { data: user } = await supabase
      .from('users')
      .select('name, email')
      .eq('id', userId)
      .maybeSingle();

    if (user) {
      nameAliases(user.name).forEach((alias) => displayNames.add(alias));
      emailHandle(user.email).forEach((handle) => handles.add(handle));
    }

    // The phone the bridge is logged in as. On WhatsApp this doubles as the
    // user's platform contact id, because mentions render as phone numbers.
    const { data: sessions } = await supabase
      .from('platform_sessions')
      .select('phone_number, platform')
      .eq('user_id', userId)
      .eq('platform', platform);

    for (const session of sessions ?? []) {
      if (!session.phone_number) continue;
      const normalized = normalizePhone(session.phone_number);
      if (normalized.length >= 9) {
        phones.add(normalized);
        contactIds.add(session.phone_number.replace(/\D/g, ''));
        contactIds.add(normalized);
      }
    }
  } catch (error) {
    logger.warn('[loops] self identity lookup failed, continuing with a weak identity', {
      userId,
      platform,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const identity: SelfIdentity = {
    userId,
    displayNames: [...displayNames],
    handles: [...handles],
    phones: [...phones],
    contactIds: [...contactIds],
  };

  cache.set(key, { identity, expiresAt: Date.now() + CACHE_TTL_MS });
  return identity;
}

/**
 * True when this identity has nothing to match on.
 *
 * Worth checking before trusting a suppression: with no aliases at all, every
 * group message looks unaddressed, so `no_self_signal` fires on everything.
 */
export function isWeakIdentity(identity: SelfIdentity): boolean {
  return (
    identity.displayNames.length === 0 &&
    identity.handles.length === 0 &&
    identity.phones.length === 0 &&
    identity.contactIds.length === 0
  );
}
