# Notification rollout and acceptance

The reliable notification implementation is already present on `main`. It is
not complete in an environment until the API, database migration, provider
credentials, and newly built clients are deployed together.

## What ships

- Expo Push delivery for iOS and Android.
- Direct APNs delivery for the native macOS app.
- Device-aware registration and deregistration.
- Redis/Bull delivery jobs and Expo receipt polling.
- Delivery audit rows, invalid-token cleanup, quiet hours, badges, deep links,
  and per-device active-chat suppression.

Windows and browser background push are not part of this rollout.

## 1. Apply the database migration

Apply migrations through the normal production migration process. The required
notification migration is:

```text
supabase/migrations/20260815000000_reliable_notification_devices.sql
```

Reload the PostgREST schema after applying it:

```sql
NOTIFY pgrst, 'reload schema';
```

Confirm both tables exist:

```sql
select to_regclass('public.notification_devices');
select to_regclass('public.notification_deliveries');
```

## 2. Configure providers

The API requires its normal Supabase and Redis configuration. macOS delivery
also requires these server-only secrets:

| Variable | Meaning |
|---|---|
| `APNS_KEY_ID` | Apple push signing key ID |
| `APNS_TEAM_ID` | Apple Developer team ID |
| `APNS_PRIVATE_KEY` | Contents of the APNs `.p8` key; escaped newlines are accepted |
| `APNS_MACOS_TOPIC` | Signed macOS app bundle identifier |
| `APNS_USE_SANDBOX` | `true` for development-signed builds; `false` for production |

Never expose those values through an `EXPO_PUBLIC_` variable or commit them.

For mobile, verify the EAS project has valid APNs and FCM credentials. The
mobile build must include the same EAS project ID configured in `mobile/app.json`.

## 3. Deploy the API

Deploy the current `main` server after the migration and secrets are ready.
Redis must be reachable by the API; notification workers run in the API process
and use the `notification-delivery` Bull queue.

Run the automated readiness check from the repository root:

```bash
CLAIRE_API_URL=https://<api-host> \
SUPABASE_URL=https://<supabase-api-host> \
SUPABASE_ANON_KEY=<anon-key> \
bun run notifications:check
```

The check intentionally uses only the public anon key. A successful result
proves that the deployed API route exists and PostgREST can see both tables; it
does not prove provider delivery.

## 4. Build new clients

Old installed builds cannot register through the new device endpoint. Produce
and install fresh binaries after the API deployment:

```bash
cd mobile
bunx eas build --profile preview --platform ios
bunx eas build --profile preview --platform android
```

Use physical devices. Expo Go and simulators do not provide a valid production
acceptance path for remote push.

Build and sign the macOS target with the Push Notifications capability. Its
`aps-environment`, `APNS_USE_SANDBOX`, and provisioning profile must agree.

## 5. Prove registration

Sign in, grant notification permission, then foreground each client once.
There must be one enabled registration per device:

```sql
select user_id, device_id, platform, provider, enabled, app_version,
       timezone, last_seen_at, token_refreshed_at
from public.notification_devices
order by last_seen_at desc;
```

Expected providers:

- iOS and Android: `expo`
- macOS: `apns`

Do not paste raw device tokens into tickets or logs.

## 6. Provider acceptance

Send a genuinely new incoming message from a connected network. Outgoing,
backfilled, and duplicate-upsert messages are intentionally ineligible.

Inspect the audit trail without exposing tokens:

```sql
select message_id, device_id, state, attempts, provider_ticket_id,
       provider_receipt_id, error_code, error_message, created_at,
       submitted_at, delivered_at, failed_at
from public.notification_deliveries
order by created_at desc
limit 50;
```

For Expo, `submitted` is not final acceptance. Wait for receipt polling to mark
the row `delivered` or `failed`. Direct APNs success is recorded as `delivered`.

## 7. Acceptance matrix

For iOS, Android, and macOS, record results for:

- foreground, background, locked, and fully quit;
- notification tap opening the correct conversation and message;
- badge increase and clearing after the chat is read;
- quiet hours and global/message notification preferences;
- two signed-in devices receiving independently;
- active-chat suppression only on the device displaying that chat;
- sign-out deregistration and token rotation;
- WhatsApp, Telegram, and Instagram incoming messages.

Record OS/app version, platform, message ID, provider ticket/receipt ID,
delivery state, latency, and failure reason in the notification umbrella issue.

## Troubleshooting order

1. No `notification_devices` row: inspect permission, physical-device status,
   EAS project ID, authentication, and the public API URL embedded in the build.
2. Registration exists but no delivery row: confirm the message was incoming,
   live, non-duplicate, and preferences permit it.
3. `suppressed`: inspect `error_code` for `quiet_hours` or `active_chat`.
4. `queued`: check Redis connectivity and API worker logs.
5. `failed`: use `error_code`; invalid tokens are disabled automatically.
6. Expo remains `submitted`: inspect receipt polling and queue health.

Rollback the client or API independently only if their public interfaces remain
compatible. Do not roll back the database migration while registrations or
delivery rows still reference the new tables.
