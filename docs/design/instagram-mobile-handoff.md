# Instagram mobile connection handoff

Checkpoint: September 24, 2026. The user requested a commit and a continuation prompt before hosted provisioning was complete.

## User decisions

- Implement mobile Instagram connection so users do not need Claire Desktop.
- The user will sign in themselves. Never request or enter their password.
- **Prepare isolated hosted staging** for the live account test (explicitly authorized).
- Keep possible upstream fixes separate. No upstream issue/PR has been published.

Read [the research review](instagram-mobile-connection-review.md) and [the implementation plan and validation](instagram-mobile-implementation-plan.md) first.

## Implemented

- Authenticated `/platforms/instagram/mobile-login` API with an exact one-user allowlist, explicit flow selection, expiration, cancellation, serialization, revision-based duplicate suppression, start rate limiting, and curated responses. Secrets and bridge IDs are not returned to React. Attempts are in memory: run one API replica.
- Native Expo iOS module: UIKit forms, OTP/account choices, approval waits, ephemeral URLSession, isolated cookie-only WKWebView challenge handling, app-switcher cover, cancellation and recovery of lost responses. No arbitrary bridge JavaScript or client HTTP forwarding. Unsupported CAPTCHA/passkey/extraction steps stop explicitly.
- Feature-gated connection entry point; Android/old binaries retain desktop setup. Legacy desktop explicitly chooses the `instagram` cookie flow so an upgraded bridge's reordered flows do not break it.
- Initial history sync can run after durable session registration; authentication and sync are separate stages.
- A development-only synthetic Simulator route (`/instagram-login-preview`) and loopback fixture server. The synthetic completion screen does **not** prove live authentication.
- Experimental hosted Docker contexts under `infra/railway/instagram-mobile/`: pinned upstream bridge commit and pinned locally tested Synapse image. Single-user Synapse uses its own SQLite volume and no federation. These new contexts have only had syntax checks, not hosted validation.
- `scripts/secrets/provision-instagram-mobile-staging.ts`: dry-run by default; `--apply` prepares dedicated staging secrets/services/volumes, leaves login disabled, and does not deploy. The script was adapted from the attempted local preparation; **the apply path remains unverified**.

## Hosted state — precise boundary

Railway CLI authentication works. The isolated project is `claire-staging`, ID `03f719da-7c4a-4bdb-9e17-0137924c024b`. Its only environment is named `production`, ID `693e23c1-f815-4a85-b427-91ba351f48bf`; that name is inside the separate staging project and is not Claire production.

Staging already has its Supabase topology, Redis, and fixture-only `claire-api`. Leave those existing services unchanged. Proposed new names: `ig-mobile-api`, `ig-mobile-synapse`, `ig-mobile-bridge`. The new API uses staging Auth/data and Redis logical database 12 to separate sessions from the fixture API. Bridge/Synapse secrets must be fresh, stored in `Claire — Staging` → `Instagram Mobile / Staging` before configuration.

**No hosted service, volume, secret item, deployment, domain or build was created.** The attempted preparation script failed at `op item list`, before its first mutation. `op signin` had returned successfully, but authentication did not carry into the later script process. Resolve the 1Password CLI session in the same operator environment; don't copy credentials into chat or terminal arguments. Consult `docs/operations/secrets.md` and existing `scripts/secrets/` workflows.

## Next steps

1. Review and run the staging provisioning script's dry run. Establish an active 1Password CLI session, then use `--apply`. Check actual service/volume bindings rather than assuming the CLI's volume-list filtering. Keep secrets out of output.
2. Deploy only the two new Docker contexts to their matching staging services with `/data` volumes. The Synapse bootstrap creates a dedicated `claire_bot` and writes its token privately at `/data/claire-bot-token`. Retrieve that token through a private operator channel, store it in the staging vault and set the new API's `MATRIX_ADMIN_TOKEN`. Never print it. The bootstrap reuses a valid saved token across restarts.
3. Prepare a clean API deployment payload from Git plus this commit, excluding unrelated dirty files. Deploy the new `ig-mobile-api` only. Production and the existing fixture API must remain untouched. Generate its HTTPS Railway domain after health checks.
4. Identify or create the user's **staging Auth identity**, with their participation. Set its exact ID as `INSTAGRAM_MOBILE_LOGIN_USER_ID`, then enable `INSTAGRAM_MOBILE_LOGIN_ENABLED=true` and use `INSTAGRAM_MOBILE_LOGIN_FLOW=android`. Keep one replica. Verify the authenticated capability endpoint against the hosted bridge.
5. Build a new internal iOS staging binary with `EXPO_PUBLIC_INSTAGRAM_MOBILE_LOGIN=true` and the new API URL, using staging Supabase values. Do not enable the synthetic preview flag. A release/internal build avoids development network inspection during real credential entry. OTA cannot add this native module.
6. Hand off sign-in to the user. Test real authentication and conversation import, then agree on recipient/content before any outbound DM. Check app close/reopen, background sync and bridge restart. Don't report unsupported challenge paths as working.

## Local verification and artifacts

- Server tests: `bun test apps/server/tests/services/instagram-mobile-login.test.ts` (HTTP tests need local sockets outside the filesystem sandbox).
- Client regression: `bun x jest tests/connection-flow.test.tsx --runInBand` from `apps/client`.
- Type checks: `bun run typecheck` in server; `bun x tsc --noEmit` in client.
- Fixture: `bun apps/server/scripts/instagram-mobile-fixture.ts`, bound only to `127.0.0.1:3309`. Accepts only username/password `fixture` and code `123456`; never contacts Instagram.
- Preview Metro: enable both `EXPO_PUBLIC_INSTAGRAM_MOBILE_LOGIN=true` and `EXPO_PUBLIC_INSTAGRAM_LOGIN_PREVIEW=true`. `NODE_OPTIONS=--dns-result-order=ipv4first` was necessary with `--localhost` because Metro otherwise bound IPv6 while the manifest advertised IPv4.
- Simulator: iPhone 17 Pro, UDID `6C6955AC-4A9D-4119-9C43-7D44B9E98EC5`; app `com.claire.app.dev`; new native module built and installed. Build artifacts/log: `/tmp/claire-instagram-build`, `/tmp/claire-instagram-build.log`.
- Temporary local Docker stack: `/tmp/claire-instagram-mobile-stack/compose.yaml`, project `claire-instagram-mobile-test`; bridge port 29329 and Synapse port 18018 on loopback. No Instagram account is linked. Its credentials are local temporary files, never commit them.
- Upstream source image: `claire-instagram-mobile:bd10396`. `Dockerfile.ig` installs `mautrix-instagram` but the upstream default launcher calls `mautrix-meta`; local tests override the executable. The new hosted context invokes the correct binary directly. This is a possible packaging contribution, not yet investigated/published upstream.
- A clean pre-commit API payload exists at `/tmp/claire-instagram-hosted/api`; prefer recreating from the committed state. Temporary provisioning metadata/credential files under `/tmp/claire-instagram-*` are local only, not portable and not for sharing.

## Workspace hygiene

The checkout already contained unrelated loop/notification, website and other work. Commit only the Instagram implementation, its docs/tests, native module, fixture and staging preparation. No push or PR is required by the user's checkpoint request. Preserve all unrelated changes.
