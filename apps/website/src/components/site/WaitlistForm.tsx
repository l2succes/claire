// SPDX-License-Identifier: Apache-2.0
'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { HeroIcon } from '@/components/site/HeroIcon';

type WaitlistFormProps = {
  source: 'homepage_hero' | 'homepage_footer';
  tone?: 'light' | 'transparent';
};

type SubmissionState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success'; emailSent: boolean }
  | { status: 'error'; message: string };

export function WaitlistForm({ source, tone = 'light' }: WaitlistFormProps) {
  const [submission, setSubmission] = useState<SubmissionState>({ status: 'idle' });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    setSubmission({ status: 'submitting' });

    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.get('email'),
          website: formData.get('website'),
          source,
          campaign: new URLSearchParams(window.location.search).get('utm_campaign'),
        }),
      });
      const result = (await response.json()) as {
        success?: boolean;
        emailSent?: boolean;
        error?: string;
      };

      if (!response.ok || !result.success) {
        throw new Error(
          result.error === 'rate_limited'
            ? 'Too many attempts. Please try again in a few minutes.'
            : 'We couldn’t save your spot just now. Please try again.',
        );
      }

      form.reset();
      setSubmission({ status: 'success', emailSent: Boolean(result.emailSent) });
    } catch (error) {
      setSubmission({
        status: 'error',
        message: error instanceof Error ? error.message : 'Something went wrong. Please try again.',
      });
    }
  }

  if (submission.status === 'success') {
    return (
      <div className={`waitlist-success waitlist-success-${tone}`} role="status">
        <span className="waitlist-success-icon">
          <HeroIcon name="check-circle" />
        </span>
        <div>
          <strong>You’re on the list.</strong>
          <p>
            {submission.emailSent
              ? 'A welcome note is on its way. Your beta invite will follow when Claire is ready.'
              : 'Your beta invite will arrive here when Claire is ready.'}
          </p>
        </div>
      </div>
    );
  }

  const statusId = `waitlist-status-${source}`;

  return (
    <div className={`waitlist-block waitlist-block-${tone}`}>
      <form className="waitlist-form" onSubmit={handleSubmit} aria-describedby={statusId}>
        <label className="sr-only" htmlFor={`waitlist-email-${source}`}>
          Email address
        </label>
        <input
          id={`waitlist-email-${source}`}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          maxLength={254}
          required
          disabled={submission.status === 'submitting'}
        />
        <div className="waitlist-honeypot" aria-hidden="true">
          <label htmlFor={`waitlist-website-${source}`}>Website</label>
          <input
            id={`waitlist-website-${source}`}
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
          />
        </div>
        <button type="submit" disabled={submission.status === 'submitting'}>
          {submission.status === 'submitting' ? 'Joining…' : 'Join the waitlist'}
          {submission.status !== 'submitting' ? <HeroIcon name="arrow-right" /> : null}
        </button>
      </form>
      <p
        className={submission.status === 'error' ? 'waitlist-status is-error' : 'waitlist-status'}
        id={statusId}
        aria-live="polite"
      >
        {submission.status === 'error'
          ? submission.message
          : (
              <>
                By joining, you agree to receive short build notes and your beta invitation. You can
                {' '}unsubscribe anytime. <Link href="/legal/privacy">Privacy</Link>
              </>
            )}
      </p>
    </div>
  );
}
