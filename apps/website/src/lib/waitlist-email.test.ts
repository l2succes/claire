// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from 'bun:test';
import { sendWaitlistWelcomeEmail } from './waitlist-email';

describe('waitlist welcome email delivery', () => {
  test('renders and sends the welcome email through Resend', async () => {
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;
    const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(JSON.stringify({ id: 'email_test_123' }), { status: 200 });
    };

    const sent = await sendWaitlistWelcomeEmail(
      {
        email: 'new-person@example.com',
        signupId: 'signup-123',
        unsubscribeToken: 'unsubscribe-token',
      },
      {
        apiKey: 're_test_key',
        from: 'Luc from Claire <updates@useclaire.co>',
        replyTo: 'hello@useclaire.co',
        siteUrl: 'https://useclaire.co',
        iosDownloadUrl: 'https://testflight.apple.com/join/claire',
        androidDownloadUrl: 'https://play.google.com/store/apps/details?id=com.claire.app',
      },
      { fetchImpl: fetchImpl as typeof fetch },
    );

    expect(sent).toBe(true);
    expect(capturedUrl).toBe('https://api.resend.com/emails');
    expect(capturedInit?.method).toBe('POST');
    expect(new Headers(capturedInit?.headers).get('Idempotency-Key')).toBe(
      'waitlist-welcome-signup-123',
    );

    const payload = JSON.parse(String(capturedInit?.body)) as {
      from: string;
      to: string[];
      reply_to: string;
      subject: string;
      html: string;
      headers: Record<string, string>;
    };
    expect(payload.from).toBe('Luc from Claire <updates@useclaire.co>');
    expect(payload.to).toEqual(['new-person@example.com']);
    expect(payload.reply_to).toBe('hello@useclaire.co');
    expect(payload.subject).toBe('You’re on the Claire beta waitlist');
    expect(payload.html).toContain('You’re on the beta list.');
    expect(payload.html).toContain('DOWNLOAD CLAIRE');
    expect(payload.html).toContain('for Android');
    expect(payload.html).toContain('waitlist-network-no-text.png');
    expect(payload.headers['List-Unsubscribe']).toContain('unsubscribe-token');
    expect(payload.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });

  test('does not attempt delivery without Resend configuration', async () => {
    let attempted = false;
    const fetchImpl = async () => {
      attempted = true;
      return new Response(null, { status: 200 });
    };

    const sent = await sendWaitlistWelcomeEmail(
      {
        email: 'new-person@example.com',
        signupId: 'signup-123',
        unsubscribeToken: 'unsubscribe-token',
      },
      {},
      { fetchImpl: fetchImpl as typeof fetch },
    );

    expect(sent).toBe(false);
    expect(attempted).toBe(false);
  });
});
