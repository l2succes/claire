// SPDX-License-Identifier: Apache-2.0
import { render } from '@react-email/render';
import { WaitlistWelcomeEmail } from '@claire/emails';

type WaitlistEmailInput = {
  email: string;
  signupId: string;
  unsubscribeToken: string;
};

type WaitlistEmailConfig = {
  apiKey?: string;
  from?: string;
  replyTo?: string;
  siteUrl?: string;
  iosDownloadUrl?: string;
  androidDownloadUrl?: string;
};

type WaitlistEmailDependencies = {
  fetchImpl?: typeof fetch;
};

export async function sendWaitlistWelcomeEmail(
  { email, signupId, unsubscribeToken }: WaitlistEmailInput,
  config: WaitlistEmailConfig,
  { fetchImpl = fetch }: WaitlistEmailDependencies = {},
) {
  if (!config.apiKey || !config.from) return false;

  const siteUrl = (config.siteUrl ?? 'https://useclaire.co').replace(/\/$/, '');
  const unsubscribeUrl = `${siteUrl}/api/waitlist/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
  const html = await render(
    WaitlistWelcomeEmail({
      siteUrl,
      unsubscribeUrl,
      iosDownloadUrl: config.iosDownloadUrl || siteUrl,
      androidDownloadUrl: config.androidDownloadUrl || siteUrl,
    }),
  );

  try {
    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(5000),
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `waitlist-welcome-${signupId}`,
      },
      body: JSON.stringify({
        from: config.from,
        to: [email],
        reply_to: config.replyTo || undefined,
        subject: 'You’re on the Claire beta waitlist',
        html,
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      }),
    });

    if (!response.ok) {
      console.error('Waitlist welcome email failed', response.status, await response.text());
      return false;
    }
    return true;
  } catch (error) {
    console.error('Waitlist welcome email failed', error);
    return false;
  }
}
