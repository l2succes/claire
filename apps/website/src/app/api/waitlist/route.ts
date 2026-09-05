// SPDX-License-Identifier: Apache-2.0
import {
  checkWaitlistRateLimit,
  getClientIp,
  getWebsiteSupabaseClient,
  normalizeCampaign,
  normalizeEmail,
  normalizeSource,
} from '@/lib/waitlist';
import { sendWaitlistWelcomeEmail } from '@/lib/waitlist-email';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const rate = checkWaitlistRateLimit(getClientIp(request));
  if (!rate.ok) {
    return Response.json(
      { success: false, error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfter) } },
    );
  }

  let parsedBody: unknown;
  try {
    parsedBody = await request.json();
  } catch {
    return Response.json({ success: false, error: 'invalid_json' }, { status: 400 });
  }
  if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
    return Response.json({ success: false, error: 'invalid_body' }, { status: 400 });
  }
  const body = parsedBody as Record<string, unknown>;

  // Bots tend to complete this visually hidden field. Return a normal success
  // so the endpoint does not teach them how to bypass the trap.
  if (typeof body.website === 'string' && body.website.trim()) {
    return Response.json({ success: true, emailSent: false }, { status: 201 });
  }

  const email = normalizeEmail(body.email);
  if (!email) {
    return Response.json({ success: false, error: 'valid_email_required' }, { status: 400 });
  }

  const supabase = getWebsiteSupabaseClient();
  if (!supabase) {
    return Response.json({ success: false, error: 'waitlist_unavailable' }, { status: 503 });
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('waitlist_subscribers')
    .upsert(
      {
        email,
        status: 'subscribed',
        source: normalizeSource(body.source),
        campaign: normalizeCampaign(body.campaign),
        consented_at: now,
        consent_version: '2026-09-05',
        unsubscribed_at: null,
        referrer: request.headers.get('referer')?.slice(0, 500) ?? null,
        updated_at: now,
      },
      { onConflict: 'email' },
    )
    .select('id, unsubscribe_token, welcome_email_sent_at')
    .single();

  if (error || !data) {
    console.error('Waitlist signup failed', error?.message ?? 'No row returned');
    return Response.json({ success: false, error: 'signup_failed' }, { status: 500 });
  }

  let emailSent = Boolean(data.welcome_email_sent_at);
  if (!data.welcome_email_sent_at) {
    emailSent = await sendWaitlistWelcomeEmail(
      {
        email,
        signupId: String(data.id),
        unsubscribeToken: String(data.unsubscribe_token),
      },
      {
        apiKey: process.env.RESEND_API_KEY,
        from: process.env.CLAIRE_WAITLIST_FROM_EMAIL,
        replyTo: process.env.CLAIRE_WAITLIST_REPLY_TO,
        siteUrl: process.env.CLAIRE_SITE_URL,
        iosDownloadUrl: process.env.CLAIRE_IOS_BETA_URL,
        androidDownloadUrl: process.env.CLAIRE_ANDROID_BETA_URL,
      },
    );

    if (emailSent) {
      const { error: updateError } = await supabase
        .from('waitlist_subscribers')
        .update({ welcome_email_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', data.id);
      if (updateError) console.error('Could not record waitlist welcome delivery', updateError.message);
    }
  }

  return Response.json({ success: true, emailSent }, { status: 201 });
}
