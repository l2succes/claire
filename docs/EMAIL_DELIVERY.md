---
title: Email delivery and templates
description: SMTP, Supabase Auth templates, and the Claire welcome-series architecture.
status: current
audience: maintainers
last-reviewed: 2026-08-17
---

# Email delivery and templates

## Current production finding

The Railway **Gotrue Auth** service has no `GOTRUE_SMTP_*` configuration. It
can create password-recovery tokens, but it has no SMTP relay through which to
deliver them. This is why password-reset emails do not arrive.

## What is in the repository

`@claire/emails` is the source of truth for Claire email design. It uses React
Email to render conservative, inbox-safe HTML that carries the landing page's
cream, ink, lime, and mono-eyebrow visual language.

```text
packages/emails/src/
  layout.tsx       # shared Claire email chrome
  auth.tsx         # Supabase/GoTrue transaction + security mail
  welcome.tsx      # app-delivered welcome-series content
  build.tsx        # renders Auth HTML into the website public directory

apps/website/public/email/auth/
  recovery.html, confirmation.html, ...
```

Run `bun run emails:build` after changing an Auth template. The generated HTML
intentionally retains GoTrue expressions such as `{{ .ConfirmationURL }}` and
`{{ .Token }}`. GoTrue fetches each public template and substitutes those
values when sending.

## Configure delivery on Railway

**Recommendation: start with Resend.** Its free tier covers 3,000 emails per
month (100 per day), includes one custom domain, SMTP relay, webhooks, and the
React Email workflow used here. That comfortably covers early Auth mail and a
small welcome series. Verify a Claire sending domain first (for example
`mail.claire.example`) and publish Resend's SPF and DKIM DNS records.

Set these variables on the Railway **Gotrue Auth** service—not on the Claire
API service:

```text
GOTRUE_SMTP_HOST=<provider SMTP host>
GOTRUE_SMTP_PORT=<provider SMTP port>
GOTRUE_SMTP_USER=<provider SMTP user>
GOTRUE_SMTP_PASS=<provider SMTP credential>
GOTRUE_SMTP_ADMIN_EMAIL=hello@<verified domain>
GOTRUE_SMTP_SENDER_NAME=Claire
GOTRUE_SMTP_MAX_FREQUENCY=1m
```

For Resend, use the concrete values below. The API key is the SMTP password
and must be created/stored only in Railway's secret-variable UI:

```text
GOTRUE_SMTP_HOST=smtp.resend.com
GOTRUE_SMTP_PORT=587
GOTRUE_SMTP_USER=resend
GOTRUE_SMTP_PASS=re_…
GOTRUE_SMTP_ADMIN_EMAIL=hello@<verified domain>
GOTRUE_SMTP_SENDER_NAME=Claire
```

Host the generated files on Claire’s public website, then configure:

```text
GOTRUE_MAILER_TEMPLATES_CONFIRMATION=https://<website-domain>/email/auth/confirmation.html
GOTRUE_MAILER_TEMPLATES_RECOVERY=https://<website-domain>/email/auth/recovery.html
GOTRUE_MAILER_TEMPLATES_MAGIC_LINK=https://<website-domain>/email/auth/magic-link.html
GOTRUE_MAILER_TEMPLATES_INVITE=https://<website-domain>/email/auth/invite.html
GOTRUE_MAILER_TEMPLATES_EMAIL_CHANGE=https://<website-domain>/email/auth/email-change.html
GOTRUE_MAILER_TEMPLATES_REAUTHENTICATION=https://<website-domain>/email/auth/reauthentication.html
GOTRUE_MAILER_TEMPLATES_PASSWORD_CHANGED_NOTIFICATION=https://<website-domain>/email/auth/password-changed.html
GOTRUE_MAILER_TEMPLATES_EMAIL_CHANGED_NOTIFICATION=https://<website-domain>/email/auth/email-changed.html
GOTRUE_MAILER_NOTIFICATIONS_PASSWORD_CHANGED_ENABLED=true
GOTRUE_MAILER_NOTIFICATIONS_EMAIL_CHANGED_ENABLED=true
```

Turn off click tracking for Auth mail at the provider. Link rewriting can break
or prematurely consume Supabase confirmation and recovery links. Restart the
Gotrue service after saving the variables, then request a password reset and
verify both delivery and the redirect destination.

## Transactional versus lifecycle email

Supabase Auth owns security-critical, transactional mail: confirmation,
recovery, magic links, invitations, email changes, reauthentication, and
account-change notifications. Those templates must remain short, direct, and
free of marketing tracking.

The welcome series is different. It belongs to Claire’s server because it
needs a persistent schedule, delivery history, consent/preferences, and an
unsubscribe path where applicable. The first two React Email components are
ready in `welcome.tsx`; do not send them from GoTrue.

The next implementation step is an `email_outbox` table plus a server worker:

1. Enrol a newly created, confirmed Claire user once.
2. Send welcome day 0, a setup nudge day 3, and a value recap day 7.
3. Record template version, provider message ID, delivery event, and opt-out.
4. Stop automatically once the user connects a messaging platform.

This keeps password reset and security mail reliable while making product email
auditable and respectful.

## References

- [React Email rendering](https://react.email/docs/utilities/render)
- [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Supabase email templates](https://supabase.com/docs/guides/auth/auth-email-templates)
