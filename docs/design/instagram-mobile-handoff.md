# Instagram mobile connection handoff

Checkpoint: September 24, 2026. Mobile Instagram setup is integrated into Claire's actual Connections flow. Hosted staging is running; the physical iPhone build and hosted real-account test remain.

## User decisions

- People should connect Instagram from Claire on their phone, without Claire Desktop.
- The user will enter their Instagram credentials and OTP themselves. Do not request them in chat or enter them on their behalf.
- Use isolated hosted staging for the real-account test. Keep Claire production untouched.
- Do not use 1Password for this test. No upstream contribution has been published.

Read [the research review](instagram-mobile-connection-review.md) and [the implementation plan](instagram-mobile-implementation-plan.md) for architecture and validation details.

## Implemented in Claire

- The real iOS Connections screen and onboarding accounts screen offer **Connect Instagram** when the authenticated mobile-login capability endpoint reports readiness. Unavailable staging shows a retry state. The native sign-in is presented as a sheet over Claire. It uses Claire's colors and typography; its intermediate states and completion remain in the Connections flow.
- A native authentication success leads to **Check connection**. Claire only shows a completed connection after the server confirms a durable platform session. An earlier standalone probe returned success without registering a Claire session.
- The authenticated API uses an exact one-user allowlist, explicit flow selection, expiration, cancellation, serialization, duplicate suppression, and start rate limiting. Credentials and bridge IDs are not returned to React. Login attempts are in memory, so run one API replica.
- The native Expo iOS module supports UIKit forms, OTP/account choices, approval waits, ephemeral networking, isolated cookie-only web challenges, app-switcher cover, cancellation, and response recovery. Unsupported CAPTCHA/passkey/extraction steps stop explicitly.
- Android and old binaries retain the desktop guide. The legacy desktop route explicitly selects the cookie flow.
- A development-only synthetic route remains for regression checks; it is not the user-facing connection experience.

Commits: `591182be` (Claire Connections integration) and `df490548` (isolated iOS staging configuration and bridge image fix). Focused client tests, targeted lint, TypeScript, and an iOS Simulator native build passed.

## Live local proof

The user signed in with their own real Instagram account and SMS OTP through the native module against an isolated **local** mautrix/meta bridge. The bridge independently reported one `CONNECTED` login, 15 conversation portals with Matrix room IDs, and 807 indexed Matrix events. Restarting that bridge preserved login. A dedicated Claire staging account subsequently displayed 15 imported Instagram chats, 546 messages, and 26 contacts. No outbound Instagram DM was sent; backfill completeness and outgoing delivery have not been established. The local Docker volume contains a live linked account and must not be deleted casually.

## Isolated hosted staging

The Railway project is `claire-staging` (`03f719da-7c4a-4bdb-9e17-0137924c024b`). Its environment happens to be named `production`, but it is inside the separate staging project. Dedicated `ig-mobile-synapse`, `ig-mobile-bridge`, and `ig-mobile-api` services now run with their own Matrix/bridge volumes and fresh secrets. The API uses staging Supabase and Redis logical database 12, at <https://ig-mobile-api-production.up.railway.app>. Its health endpoint returns 200.

A **fresh** Claire staging Auth account is the sole allowed pilot. The authenticated `/platforms/instagram/mobile-login/capabilities` endpoint returned `200 {"available":true}` for that account. Its AI, auto-reply, and notifications are disabled. The hosted bridge is fresh: the user has **not** signed into Instagram there yet. The earlier local bridge login and its chat import belong to a different staging test account. Do not claim the hosted Instagram connection has completed.

Secrets and private test-account details are in mode-0600 files under `/tmp/claire-instagram-hosted/`, never in the repository. `scripts/secrets/provision-instagram-mobile-staging.ts` remains a dry-run-by-default alternative; it was not the path used for this setup. No 1Password item was created.

The separate Simulator app is `com.claire.app.staging`, configured for the hosted API. Screenshots: `/tmp/claire-instagram-dedicated-connections.png` shows the real Claire Connect Instagram screen with the ready sign-in button; `/tmp/claire-instagram-dedicated-native-sheet-final.png` shows the hosted native sign-in sheet with Claire's camera mark before credentials; `/tmp/claire-instagram-hosted-new-account.png` shows Instagram on Claire's onboarding accounts screen; `/tmp/claire-instagram-staging-signed-in.png` shows the earlier local import in Claire's inbox. The final route and sheet check used a dedicated `ClaireInstagramStaging` Simulator because the shared iPhone 17 Pro is driven by other work.

## Remaining launch work

1. Renew the **expired staging Apple provisioning profile**. `eas build --platform ios --profile staging` could not create an internal iPhone build without an interactive Apple Developer sign-in. The Simulator build succeeds but cannot be installed on a physical phone.
2. The user signs in themselves on the internal iPhone build and completes OTP. On the fresh hosted account, confirm durable Claire session registration, chat import, app close/reopen, background sync, and bridge restart. Test outbound DM only with an agreed recipient and content. Inspect backfill tasks before calling history complete.

Do not ship this as generally available until the hosted real-account test is complete. Preserve all unrelated dirty checkout files; stage only Instagram-related changes.
