// SPDX-License-Identifier: Apache-2.0
import { platformCatalog } from '@claire/platform-catalog';
import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getClientIp, getWebsiteSupabaseClient } from '@/lib/waitlist';

export const runtime = 'nodejs';

const voterCookie = 'claire_platform_voter';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const voteRateBuckets = new Map<string, { count: number; resetAt: number }>();

function checkVoteRateLimit(ip: string) {
  const now = Date.now();
  const current = voteRateBuckets.get(ip);
  if (!current || current.resetAt <= now) {
    voteRateBuckets.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return { ok: true as const };
  }
  if (current.count >= 30) {
    return { ok: false as const, retryAfter: Math.ceil((current.resetAt - now) / 1000) };
  }
  current.count += 1;
  return { ok: true as const };
}

export async function POST(request: Request) {
  const rate = checkVoteRateLimit(getClientIp(request));
  if (!rate.ok) {
    return NextResponse.json(
      { success: false, error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'invalid_json' }, { status: 400 });
  }

  const platformId =
    body && typeof body === 'object' && 'platformId' in body && typeof body.platformId === 'string'
      ? body.platformId
      : '';
  const platform = platformCatalog.find((item) => item.id === platformId);
  if (!platform || platform.supportStatus !== 'planned') {
    return NextResponse.json({ success: false, error: 'planned_platform_required' }, { status: 400 });
  }

  const supabase = getWebsiteSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ success: false, error: 'voting_unavailable' }, { status: 503 });
  }

  const cookieStore = await cookies();
  const existingVoterId = cookieStore.get(voterCookie)?.value;
  const voterId = existingVoterId && uuidPattern.test(existingVoterId) ? existingVoterId : randomUUID();

  const { error } = await supabase.from('platform_votes').upsert(
    {
      platform_id: platform.id,
      voter_id: voterId,
      source: 'homepage_catalog',
    },
    { onConflict: 'platform_id,voter_id', ignoreDuplicates: true },
  );

  if (error) {
    console.error('Platform vote failed', error.message);
    return NextResponse.json({ success: false, error: 'vote_failed' }, { status: 500 });
  }

  const response = NextResponse.json({ success: true, platformId: platform.id }, { status: 201 });
  if (!existingVoterId || existingVoterId !== voterId) {
    response.cookies.set(voterCookie, voterId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return response;
}
