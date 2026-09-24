# Instagram mobile connection — implementation plan

September 23, 2026. Builds on [the connection review](instagram-mobile-connection-review.md).

## Approach

Authenticate on iOS, then keep messaging and AI on Claire's hosted Matrix bridge. Begin with one allowlisted user and a separate staging bridge identity. Existing desktop setup stays available; Android follows after the iOS test.

Use mautrix's `android` provisioning flow (the protocol name, also usable by iOS). It was merged in [PR 361](https://github.com/mautrix/meta/pull/361), commit `bd10396cdb83fbd71881a479f30d4c477afb2ddd`, after the September release. Pin this source for the experiment. Released `ig-v26.09` supports `instagram-password` as an explicit comparison. Production `ig-v26.07` cannot serve these flows. Do not replace the production bridge for this experiment.

## Implementation

1. Add authenticated mobile login endpoints backed by a coordinator. Bind attempts to their Claire user; keep bridge IDs server-side. Enforce TTL, serialization, revision-based duplicate suppression and cancellation. Never persist or log submitted secrets. Return curated metadata, not the upstream completed-login object.
2. Add an Expo iOS module. UIKit owns credential and verification fields; ephemeral URLSession posts to Claire. React receives only the outcome. Handle account choices, approval waits, and cookie-only browser challenges with isolated WKWebView storage, HTTPS origin validation and native HttpOnly cookie capture. Never evaluate bridge-supplied JavaScript.
3. Enable the entry point only with the native module and `EXPO_PUBLIC_INSTAGRAM_MOBILE_LOGIN=true`. Server requires `INSTAGRAM_MOBILE_LOGIN_ENABLED=true` and one exact `INSTAGRAM_MOBILE_LOGIN_USER_ID`. Choose `INSTAGRAM_MOBILE_LOGIN_FLOW=android` (default) or `instagram-password` explicitly. Existing binaries and Android keep desktop setup.
4. Test server contracts and the actual iOS Simulator app. The user will enter their own Instagram credentials. Test login, available 2FA, cancellation and retry, then verify conversation sync. Choose a recipient and message with the user before testing outbound DMs. Finally test app reopening and bridge restart survival.
5. If a bridge defect appears, prepare a minimal upstream fix with a synthetic reproduction. Keep Claire UX separate; never publish account data.

## First iteration boundaries

Provider HTTP requests run on the bridge. Client HTTP proxy steps, arbitrary JavaScript extraction, CAPTCHA token extraction and passkeys are explicitly unsupported. They fail with a clear message. A required unsupported step becomes the next implementation target, based on observed evidence.

Success requires bridge completion and Claire session registration. Initial history sync happens afterward. Attempts are ephemeral and require one server process; restart expires pending login. General rollout requires per-user Matrix identity/device isolation, distributed attempt coordination, Android implementation and live challenge coverage.

## Verification

- Server: auth/allowlist, explicit flow, foreign ownership, field validation, stale/concurrent submissions, expiry, cancellation, unsupported steps, unsafe URLs, redacted errors, complete-only session registration.
- Native: autolink/build and actual Simulator presentation; secure field, keyboard, choice, verification, cancellation, app-switcher cover, lost-response recovery and completion. Browser compatibility requires a real account producing that challenge.
- Live: pinned isolated bridge advertises the flow; user login; history; approved send/receive; background delivery; restart; reconnect; log/telemetry inspection.

## Rollout and rollback

This requires a new native binary, not just OTA. Enable client flags only on the preview build and server flags only on the staging instance connected to the isolated bridge. Disable the flags to restore desktop setup. Snapshot the staging bridge database before image upgrades; never downgrade migrated production data in place.

## Validation record

- Server: 14 focused tests pass (56 assertions), covering the coordinator and authenticated route boundary. The focused server lint check passes.
- Client: TypeScript passes; all 6 existing connection-flow tests pass. Server TypeScript passes.
- Native: `pod install` and Debug iOS Simulator build pass. In the actual Claire app, synthetic credentials advance to verification and completion; cancellation returns to the test screen.
- Upstream: built commit `bd10396cdb83fbd71881a479f30d4c477afb2ddd`; started an isolated local Synapse/bridge stack; the real provisioning API advertises `android`, `instagram`, and `instagram-password`. The `android` flow starts with username/password fields and cancels successfully without credential submission.
- Live Instagram account login, browser challenge compatibility, history sync, background delivery and restart survival remain unverified.
- The user authorized isolated hosted staging and will enter their own Instagram credentials. Hosted provisioning has **not** run successfully: the preparation script stopped at 1Password item listing before any hosted resource or secret creation. See [handoff](instagram-mobile-handoff.md).
