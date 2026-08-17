---
title: Google sign-in and account recovery
description: Production configuration for Claire across web, Electron, iOS, and Android.
status: current
audience: maintainers
last-reviewed: 2026-08-17
---

# Google sign-in and account recovery

Claire has one Supabase Auth user per person. Google is one way to prove who
that person is; email and password can be attached to the very same user later.
The Expo client runs on web, Electron, iOS, and Android, so the OAuth callback
is deliberately chosen by the host rather than hard-coded to one platform.

## The two URLs that are easy to confuse

There are two separate redirect hops:

```text
Claire client -> Supabase Auth -> Google -> Supabase Auth callback -> Claire client
                                      ^                         ^
                         Google OAuth client callback       client redirectTo
```

1. **Google callback** — configure only the Supabase Auth callback in Google
   Cloud. For production this must be
   `https://auth.claire.example/auth/v1/callback` (replace with the real
   branded Auth domain). It is not an iOS, Android, Electron, or app-web URL.
2. **Client redirect** — configure the destinations to which Supabase may send
   a successfully authenticated person. Claire derives it with
   `getAuthRedirectUri()` in `apps/client/services/googleAuth.ts`:

   | Host | Callback produced by Claire |
   | --- | --- |
   | iOS / Android release build | `claire://confirm` |
   | Browser | `<current web origin>/confirm` |
   | Electron development | `http://localhost:<port>/confirm` |
   | Packaged Electron | `claire-app://app/confirm` |

The same helper is used by Google login and email confirmation. Do not change
one flow to `claire://auth/confirm`; Expo route groups are not URL segments and
that URI is a different callback.

## Make the Google screen say Claire

The screenshot's “continue to `kong-production-….railway.app`” is not the
name configured in the mobile app. Google derives that line from its callback
domain. Changing the button text, Expo name, or OAuth client label cannot
change it.

1. Put a TLS-enabled custom domain such as `auth.claire.example` in front of
   the public Supabase Auth/Kong endpoint. For hosted Supabase, use a Custom
   Domain; for the self-hosted Docker stack, point DNS/reverse proxy traffic at
   Kong.
2. Set the deployment's `API_EXTERNAL_URL` to that exact HTTPS domain, then
   restart the Auth/Kong service. Do not use the Railway generated host as the
   public Auth URL once the custom domain is live.
3. In Google Auth Platform, add
   `https://auth.claire.example/auth/v1/callback` to the OAuth web client's
   **Authorized redirect URIs**. Keep the old callback during rollout, then
   remove it only after the new domain is working.
4. In Google Auth Platform → Branding, set the app name to **Claire**, upload
   `apps/client/assets/icon.png` as the application logo, add a support email,
   homepage, privacy-policy URL, and developer contact. Publish/verify the
   brand as required for the requested scopes.

The custom Auth domain fixes the account-chooser domain; the Google Branding
configuration supplies Claire's name and logo on Google's consent surface.

## Supabase redirect allow-list

In Supabase Auth URL Configuration (or, for the self-hosted stack,
`ADDITIONAL_REDIRECT_URLS`), allow the callbacks Claire actually creates:

```text
https://app.claire.example/confirm
claire://confirm
claire-app://app/confirm
http://localhost:8081/confirm
http://localhost:8083/confirm
```

Use the real production app origin and the specific development ports in the
deployed environment. A temporary `http://localhost:**` wildcard is acceptable
only in local development. `SITE_URL` is merely the fallback when no
`redirectTo` is supplied; it does not replace this allow-list.

For self-hosted Auth, keep `GOTRUE_URI_ALLOW_LIST` sourced from
`ADDITIONAL_REDIRECT_URLS` and supply the comma-separated values via deployment
secrets. No Google client secret belongs in the repository.

## Google provider configuration

Create one Google OAuth **Web application** client for each environment. Put
its client ID and secret in the corresponding Supabase Auth provider settings
(`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` for this self-hosted stack). The
Google client needs the Supabase Auth callback above; it does not need each
Claire client callback as a Google redirect URI.

Use separate dev, staging, and production Google OAuth clients. This keeps a
localhost callback or a test audience from affecting production login.

## Password sign-in for a Google-created account

When signed in with Google, open **Settings → Account & security → Add a
password**. The client calls `supabase.auth.updateUser({ password })`; Supabase
adds email/password authentication to the existing user instead of creating a
second account. The Google sign-in remains available as a fallback.

If a user is signed out everywhere, use the standard password-recovery flow to
their verified email rather than attempting to create a second account with the
same address.

## Verification matrix

Before release, test one existing account in every row:

| Scenario | Expected result |
| --- | --- |
| Browser Google login | Returns to the same browser origin's `/confirm` and reaches the dashboard when a platform is connected. |
| Electron Google login | Returns to Electron's renderer `/confirm`; no external browser window is opened after completion. |
| iOS / Android Google login | Returns through `claire://confirm` to the installed app. |
| Add password after Google login | Email/password login returns the same `auth.users.id`, chats, and connected platform sessions. |
| Login on a second client | The same account's chats and connected WhatsApp/Telegram/Instagram sessions are visible without reconnecting. |

## References

- [Supabase: Login with Google](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Supabase: Native mobile deep linking](https://supabase.com/docs/guides/auth/native-mobile-deep-linking)
- [Supabase: Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Supabase: Identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking)
