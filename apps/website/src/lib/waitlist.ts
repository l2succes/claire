// SPDX-License-Identifier: Apache-2.0
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const MAX_EMAIL_LENGTH = 254;
export const MAX_CAMPAIGN_LENGTH = 100;
const RATE_LIMIT = 6;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const allowedSources = new Set(['homepage_hero', 'homepage_footer']);
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

let waitlistClient: SupabaseClient | null = null;

export function normalizeEmail(value: unknown) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (!email || email.length > MAX_EMAIL_LENGTH) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export function normalizeSource(value: unknown) {
  return typeof value === 'string' && allowedSources.has(value) ? value : 'homepage_hero';
}

export function normalizeCampaign(value: unknown) {
  if (typeof value !== 'string') return null;
  const campaign = value.trim();
  return campaign ? campaign.slice(0, MAX_CAMPAIGN_LENGTH) : null;
}

export function checkWaitlistRateLimit(ip: string) {
  const now = Date.now();
  const current = rateBuckets.get(ip);
  if (!current || current.resetAt <= now) {
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { ok: true as const };
  }
  if (current.count >= RATE_LIMIT) {
    return { ok: false as const, retryAfter: Math.ceil((current.resetAt - now) / 1000) };
  }
  current.count += 1;
  return { ok: true as const };
}

export function getClientIp(request: Request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

export function getWebsiteSupabaseClient() {
  if (waitlistClient) return waitlistClient;

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) return null;

  waitlistClient = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return waitlistClient;
}
