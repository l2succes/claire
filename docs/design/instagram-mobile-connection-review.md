# Instagram connection on mobile

Reviewed September 23, 2026. Status: proposed direction; implementation and live account acceptance remain outstanding.

## Recommendation

Make Instagram setup available directly in Claire mobile through the upstream bridge's newer interactive login flows. Keep the established hosted Instagram → Matrix → Claire message pipeline, so incoming messages, notifications, search, and AI do not depend on the phone keeping Claire open.

The first investment should be an isolated bridge/login feasibility spike, followed by the complete mobile flow. Do not start by rebuilding the Instagram messaging connector or restoring the old mobile WebView wholesale.

This recommendation assumes personal Instagram accounts remain in scope. Meta's official professional-account messaging API is a different product option, not equivalent personal inbox access.

## What changed since our earlier decisions

The earlier cookie-only premise is now out of date for newer upstream code:

- Claire's Railway Dockerfile pins `dock.mau.dev/mautrix/meta:ig-v26.07`. The matching July source exposes only the `instagram` cookie flow. This is repository configuration, not a fresh inspection of the running production image.
- Upstream **v26.09 / v0.2609.0**, published September 16, explicitly adds Instagram password login. The release warns that some accounts still require a WebView, so a simple credential form alone is insufficient. The flow ID is `instagram-password`.
- Upstream **PR #361**, merged September 22 at commit `bd10396cdb83fbd71881a479f30d4c477afb2ddd`, adds an Android-API login flow usable by both cloud and on-device connections. Its provisioning flow ID is `android`; the PR's `instagram-native` rollout flag refers to Beeper configuration, not a Claire flag or an iOS/Android client restriction.
- That PR reports fresh Android login, self-hosted restart, send/receive, and background notification validation. It explicitly says **fresh iOS setup remained unverified because the SMS never arrived**. Those are upstream reports, not Claire acceptance evidence.
- The September 22 change is newer than the latest published September 16 release inspected here. Do not assume upgrading to the September release includes it. Evaluate exact tagged/commit builds and pin the accepted image digest.

Sources: [July login source](https://github.com/mautrix/meta/blob/v0.2607.0/pkg/igconnector/login.go), [September release](https://github.com/mautrix/meta/releases/tag/v0.2609.0), [released password flow](https://github.com/mautrix/meta/blob/v0.2609.0/pkg/igconnector/login_native.go), [September 22 native login change](https://github.com/mautrix/meta/pull/361), [exact new flow selection](https://github.com/mautrix/meta/blob/bd10396cdb83fbd71881a479f30d4c477afb2ddd/pkg/igconnector/login.go).

## Review of our discussions and specifications

The relevant archived **Desktop UI** discussion records this sequence:

1. Browser-cookie/cURL setup was rejected as unacceptable user experience.
2. Mobile native login and an on-device connector were considered, including uploading normalized messages for Claire AI.
3. The discussion shifted to a desktop companion for Instagram and iMessage, and the unused mobile device-sync spike was removed.
4. A native macOS WebKit authentication window was built; Electron later replaced that desktop host.

The **Redesign mobile onboarding flow** discussion deliberately preserved existing authentication mechanisms: WhatsApp/Telegram on the phone, Instagram as one-time desktop setup, and iMessage on a Mac that remains online. That was a UX scope decision, not evidence that Instagram can never connect from iOS.

Two previous conclusions need qualification:

- “Only cookie login exists” accurately describes the July bridge, but not the newer release/source above. The upstream authentication guide still describes cookie-only Instagram setup; versioned source and release notes are more specific evidence here.
- Mobile authentication does not inherently require mobile message delivery. Beeper's on-device architecture was a useful comparison, but Claire can pursue phone setup followed by hosted bridge operation. Beeper currently documents Instagram in both on-device and cloud connection categories; this does not establish which implementation Claire can reuse.

The local specs reviewed were:

| Source | What to retain or revise |
| --- | --- |
| `apps/website/src/content/docs/build-claire/desktop-spec.tsx` | Retain native handling of session material and proof before exposure. Supersede desktop-only Instagram as the target once mobile passes. |
| `apps/website/src/content/docs/product/connectors.tsx` | Retain cloud runtime, shared connection state, and production certification. Broaden the authentication boundary to native mobile. |
| `apps/website/src/content/docs/get-started/companion-app.tsx` | Replace the Instagram desktop requirement after release. Its broad claims that the session stays on the computer and the companion must remain online conflict with the newer cloud-runtime catalog. Keep the always-online requirement specific to iMessage. |
| `apps/website/src/content/docs/plans/unified-ai-messenger-client.tsx` and `matrix-bridge-integration.tsx` | Historical cookie/manual setup context, not the new product contract. |
| `apps/website/src/content/docs/product/security.tsx` and `end-to-end-encryption.tsx` | Retain the trusted-cloud boundary and accurate credential/AI disclosures. Mobile login does not imply local-only messages or zero knowledge. |
| `docs/testing/connection-recovery.md` | Retain recovery of the exact existing login without automatically starting authentication. |
| `docs/legal/public-launch-privacy-audit.md` | Update actual transient credential handling and retention when the new flow ships. |

GitHub [#98](https://github.com/l2succes/claire/issues/98) already defines real Instagram acceptance: login, persistence, history, send/receive, media/groups, self-attribution, and reconnect. Mock success is not that evidence.

## What the code currently does

- `apps/client/features/connections/connection-platform-config.ts` groups Instagram with companion setup. `connection-flow-screen.tsx` renders the companion guide rather than initiating mobile authentication.
- `packages/host/src/host.native.ts` implements `startInstagramLogin()` as a desktop-required error. The seam exists, but no native login implementation exists there.
- `apps/desktop/src/instagram-login.ts` owns an isolated Electron browser, captures cookies, and submits them to Claire's API. It illustrates the boundary, not a complete state machine to port: it treats any successful HTTP submission as completion, although the server can return another login step. Its success path also destroys the window before resolving success, while the closed handler resolves cancellation; review that ordering separately.
- `apps/server/src/routes/platforms.ts` already calls the provisioning API. However, start chooses `flows[0]`, discards most step-specific parameters, and returns a hard-coded browser URL. An upgrade can change flow order. **Select explicitly by supported flow ID.**
- The submit endpoint only supports cookies. It authenticates the caller but does not visibly bind the supplied session/login/step tuple to that caller before provisioning. A new flow must enforce ownership at this boundary.
- `BridgeHttpClient` has user-input and wait helpers, but its types omit the complete interactive contract, including `client_http`, field definitions, and structured challenge data. It also lacks login cancellation methods.
- The old `/login/credentials` and `/login/2fa` routes drive Puppeteer on the server and return cookies. They are a separate legacy implementation, not the new upstream password flow. Do not revive them as the mobile solution.

Historical commit `3ad2317b` (August 11) removed a React Native WebView login because it rejected or failed to load Instagram reliably. That implementation already used native cookie access, including HttpOnly cookies; simply replacing `document.cookie` is not a new fix. It used a hard-coded iOS 17 user agent, shared cookies, navigation-driven completion, and returned cookies through a React callback. No preserved controlled experiment reviewed here establishes the exact failure cause.

## Proposed mobile experience

Instagram joins **Connect on this phone** only for client/server combinations that support the accepted flow.

1. Tap **Connect Instagram** in onboarding or Settings.
2. See a brief explanation of cloud sync and credential handling, then the login fields requested by the bridge.
3. Complete the requested verification: authenticator/SMS/email code, approval in Instagram, profile selection, or an interactive challenge. Do not hard-code every verification to six digits; backup codes and future fields differ.
4. Show **Connecting**, then the confirmed account and **Syncing conversations**. Show a useful inbox as chats arrive; do not promise complete historical backfill.
5. Show a persistent success screen with **Done**. Reauthentication uses the same mobile entry point and preserves existing chat identity/history.

Cancellation, incorrect credentials, missing codes, rate limiting, unsupported verification, network loss, app backgrounding, and expired attempts get explicit recoverable states. Avoid automatic repeated password submissions or starting a new login merely because Claire resumes.

For an account that needs an external Instagram approval, recheck on return. Opening Instagram or Safari alone does not transfer its browser session to Claire. A cookie/challenge step requiring session extraction needs a contained native browser with a tested handoff.

## Architecture and implementation scope

### 1. Certify the upstream flow before selecting the default

Create an isolated staging Instagram bridge with its own database. Compare the released `instagram-password` flow against the September 22 `android` flow from an exact commit. Inspect `/v3/login/flows` on each candidate; record version and image digest. Verify the chosen build's configuration migration and restoration before touching production.

Start with a native iOS test client and a dedicated test account. Compare server-originated login requests with the bridge's optional client-HTTP transport if login behavior requires it. This is an experiment with a measurable outcome, not a promise that device-origin requests eliminate Instagram challenges.

Do not migrate a production bridge database merely to test a version. Rollback after schema changes requires an appropriate backup/restore plan, not just changing the image tag.

### 2. Add an authenticated login coordinator

Claire's API remains the only public broker; bridge provisioning secrets never ship in the app.

- Bind each attempt to Claire user, platform, bridge instance/version, session, flow ID, login ID, current step, transaction, and expiry.
- Return normalized UI state; keep sensitive payloads out of ordinary application state and persistent stores.
- Support user input, display-and-wait, cookies/challenges, cancellation, and client-HTTP where needed. Reject unsupported step kinds explicitly. Do not treat HTTP 200 or a discovered cookie as authenticated completion.
- Advance serially, reject stale/replayed or cross-user submissions, and reconcile after a lost response before retrying. Cancel upstream work when the user cancels or starts a replacement attempt.
- Require upstream completion plus matching account/session identity. Track initial message sync separately from authentication.
- Check multi-user isolation: today's provisioning client defaults to a shared Matrix bot identity, while newer login code stores device identity per Matrix user. Verify routing, account association, independent revocation, and persistent login-device identity across two Claire users before wider rollout.

### 3. Implement mobile capabilities

Use a local Expo native module where the accepted flow needs native networking, ephemeral browser state, or secret handling. Existing native-module structure is under `apps/client/modules/`.

- For client HTTP, implement the upstream request/response contract through an ephemeral native session, including multiple headers, body encoding, redirects, cancellation, and bounded response sizes. Restrict hosts and redirects to the approved Instagram flow; reject localhost/private-network destinations and unrelated protocols. Do not expose an arbitrary request relay.
- For interactive browser verification, use an isolated `WKWebView` and its own `WKWebsiteDataStore`/`WKHTTPCookieStore`; observe state changes rather than relying only on page navigation. Clear ephemeral material on completion, cancellation, and expiry.
- Keep cookies, challenge tokens, and transport bodies out of React/Zustand/AsyncStorage, telemetry, request logs, screenshots used for diagnostics, and crash reports. Credential entry must be transient and cleared. Verify retention inside the bridge too.
- Password login means Claire/its bridge may transiently process the password. Do not reuse the desktop claim that Claire never handles it. The established session remains at the bridge for ongoing sync.
- Return only sanitized status/account/error information to the normal connection UI. Never forward bridge-requested arbitrary JavaScript without a narrowly reviewed implementation.

Native module changes require a new iOS/TestFlight binary. JavaScript-only EAS updates cannot add those capabilities. Android gets its own native verification; the upstream flow name `android` does not mean only Claire Android can use a server-hosted bridge.

References: [manager's step driver](https://github.com/mautrix/manager/blob/main/src/api/loginclient.ts), [manager's step types](https://github.com/mautrix/manager/blob/main/src/types/loginstep.ts), [Apple cookie store](https://developer.apple.com/documentation/webkit/wkhttpcookiestore), [Apple website data stores](https://developer.apple.com/documentation/webkit/wkwebsitedatastore).

### 4. Integrate without changing message ownership

Extend `use-connection-flow.ts` with the new coordinator and keep route files thin. Update `types/platform.ts`, `services/platforms.ts`, host capability reporting, onboarding groups, and Settings together. Replace permanent platform-only capability assumptions with client capability plus server-supported flow information.

Update `packages/platform-catalog` and the client's fallback catalog only when mobile is available; older clients still need truthful guidance. Keep existing desktop connections valid and preserve account-scoped message IDs, outbox behavior, notifications, and AI ingestion. Reconnecting must not create duplicate chats or disconnect a healthy account before its replacement is verified.

## Alternatives

| Approach | Assessment |
| --- | --- |
| Mobile UI using newer bridge login, cloud messaging | Recommended first. Reuses ingestion/AI and removes the desktop download. Fresh iOS setup and challenge handling remain gates. |
| Mobile browser cookie handoff into the cloud bridge | Useful fallback/spike. Apple's APIs provide the primitives, but Claire's prior WebView failure must be reproduced and resolved. |
| Fully on-device Instagram connector with cloud message upload | Larger separate project: protocol runtime, background delivery, encrypted queues, device registration, and sync. Not necessary merely to move setup to mobile. Beeper's push relay is not automatically available to Claire. |
| Official Meta OAuth | Viable for a separate Business/Creator connector. Professional accounts, messaging eligibility, and no group messaging make it a different scope from personal-DM parity. |
| Old server Puppeteer form or manual cookie/cURL paste | Do not use for the consumer flow. Existing failure modes and user friction remain. |

Sources: [Beeper Instagram setup](https://help.beeper.com/instagram), [Beeper connection models](https://help.beeper.com/en_US/chat-networks/using-on-device-chat-network-connections-in-beeper), [Meta's official API collection](https://www.postman.com/meta/workspace/instagram/documentation/23987686-9386f468-7714-490f-9bfc-9442db5c8f00).

## Acceptance and delivery order

1. **Feasibility:** fresh iPhone login against the chosen staging build; no desktop, cookie paste, or operator repair. Prove first sync and receive while Claire is suspended. Record failures by login step and account configuration without secrets.
2. **Coordinator/native implementation:** verify ownership, stale steps, cancellation, transport restrictions, redaction, duplicate callbacks, lost responses, and bridge restart behavior with focused tests.
3. **Mobile UX:** native iOS Simulator for layout, keyboard, accessibility, and lifecycle; physical iPhone/TestFlight for real authentication, app switching, and notifications. Include fresh accounts and existing-session reauthentication, 2FA variants, checkpoint/CAPTCHA, and cancellation.
4. **Messaging acceptance:** dedicated-account send/receive, self-attribution, supported media/groups, history limits, app/bridge restart, explicit revocation, two-user isolation, and reconnect without duplicates. Confirm one synced synthetic conversation becomes available to Ask Claire/loop processing. Real account login/sending is a separate account-owner test action, not performed in this review.
5. **Rollout:** small opt-in cohort, server flow flag and native capability gate, observed completion/failure rates, session survival after 24 hours and a week, then catalog/docs updates. Preserve healthy sessions if the new-login flag is disabled.

If neither newer flow passes fresh iPhone login and challenge handling, keep mobile setup labeled experimental and reassess the native-browser fallback. Do not disguise another desktop dependency as the completed mobile experience.

This review inspected repository code/history, relevant archived discussions, existing GitHub acceptance issues, and current upstream release/source material. It did not authenticate an Instagram account, modify a running bridge, send messages, or establish production readiness.
