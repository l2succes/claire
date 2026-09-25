# Instagram mobile connection handoff

Checkpoint: September 25, 2026. The production backend and mobile release configuration are prepared for a real Instagram sign-in test. The production flow is still disabled until it is allowlisted to the user's exact Claire account, and the internal iOS build is waiting on Apple credential renewal.

## User decisions

- Build Instagram connection inside Claire's iOS connection flow.
- The user will enter their Instagram credentials and verification code themselves. Never request or enter their password in chat.
- Test against production after reviewing the deployment and mobile build. The user will complete Apple sign-in directly in the opened EAS terminal.
- Avoid synthetic login fixtures and 1Password for the live production sign-in path. The previous fixture was local-only and did not authenticate with Instagram.

Read [the research review](instagram-mobile-connection-review.md) and [the implementation plan and validation](instagram-mobile-implementation-plan.md) first.

## Implemented

- Authenticated `/platforms/instagram/mobile-login` API with an exact one-user allowlist, explicit flow selection, expiration, cancellation, serialization, revision-based duplicate suppression, start rate limiting, and curated responses. Secrets and bridge IDs are not returned to React. Attempts are in memory: run one API replica.
- Native Expo iOS module: UIKit forms, OTP/account choices, approval waits, ephemeral URLSession, isolated cookie-only WKWebView challenge handling, app-switcher cover, cancellation and recovery of lost responses. No arbitrary bridge JavaScript or client HTTP forwarding. Unsupported CAPTCHA/passkey/extraction steps stop explicitly.
- Feature-gated Claire connection entry point; Android/old binaries retain desktop setup. Instagram sign-in and verification steps are pushed inside the same modal navigation stack.
- The API now supports the production bridge's advertised `instagram` login flow, in addition to the implemented Android and password flows. The mobile app asks the bridge for advertised capabilities and does not assume flow order.
- Initial history sync can run after durable session registration; authentication and sync are separate stages.
- A local synthetic Simulator preview and loopback fixture were used during development only. They are not evidence of a real Instagram sign-in and are not used by the production flow.

## Current production state

- Branch: `codex/instagram-production-release`, rebased on current `origin/main` (`980d09c65`). Release changes are committed through `fe0d8d837` (`fix(instagram): select bridge-advertised production login flow`).
- Railway production API service `claire` has been deployed at `https://api.useclaire.co`. The current release deployment is `2722ae16-4db6-455c-b9b4-512c20d05e1d`; Railway reported it Online and `/healthz` returned HTTP 200.
- The live bridge advertises flow `instagram`; the server and app now select it explicitly.
- `INSTAGRAM_MOBILE_LOGIN_ENABLED` and `INSTAGRAM_MOBILE_LOGIN_USER_ID` are not configured in production. Therefore the feature remains disabled. Before enabling, identify the user's exact Claire production Auth UUID and set the one-user allowlist, feature flag, and `INSTAGRAM_MOBILE_LOGIN_FLOW=instagram`. Do not enable for all users or guess the UUID.
- The iOS production EAS profile sets `EXPO_PUBLIC_INSTAGRAM_MOBILE_LOGIN=true` and uses the production API configuration. No successful production Instagram authentication or conversation import has been verified yet.
- EAS authentication succeeded, but the internal iOS build stopped because the Apple provisioning profile expired. An interactive EAS terminal is open and waiting for the user to sign into Apple and complete 2FA themselves. Resume that same terminal session; do not ask for or handle credentials in chat.
- This is an internal install build for testing, not an App Store submission. Do not submit it unless the user asks.

## Next steps

1. Continue the open EAS iOS build after the user completes Apple account sign-in in the terminal. If EAS needs an Apple team or device/provisioning choice, keep the user in control of Apple authentication and device registration. Record the EAS build URL and result.
2. Once the app can sign into production Claire, resolve the signed-in Claire user's exact Auth UUID. Ask for the production Claire account email only if necessary; do not infer identity from Git metadata. Set the production one-user allowlist and enable the Instagram mobile flow only for that UUID.
3. Install the internal build and have the user complete the Instagram sign-in and any OTP/approval step in-app. Verify session durability, bridge state, and conversation import. Do not send outbound Instagram messages as part of validation.
4. If real sign-in fails, capture a redacted error/state and bridge logs without printing session cookies, passwords, OTP values, or bridge secrets. Check challenge type and bridge-advertised login flow before changing the UX.
5. Consider an upstream packaging contribution only after the production path is validated. No upstream issue or PR has been published.

## Verification already completed

- Server typecheck and client TypeScript check passed.
- The Instagram mobile login service/API tests passed during implementation; HTTP tests require local sockets outside the filesystem sandbox.
- Production API Docker image built successfully, and frozen Bun dependency installation succeeded using the Railway Bun image.
- Railway health check passed after deployment.
- Production bridge capability query returned HTTP 200 and advertised `instagram`.

## Historical implementation artifacts

- The local fixture accepts only `fixture` / `123456`, binds to loopback, and never contacts Instagram. It is not part of the production test path.
- Earlier staging-provisioning scripts, experimental Docker contexts, and the local fixture are historical development artifacts. The production deployment used the existing API service; no new staging bridge or 1Password integration is required to validate the live account flow.
- Native iOS sign-in depends on the module included in the new binary; an OTA update cannot add it to an older installed app.
