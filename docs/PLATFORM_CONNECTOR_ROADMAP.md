# Claire connector and hosting roadmap

This document is the implementation contract behind the public connection
catalog. The canonical machine-readable definitions live in
`server/src/platform-catalog.ts`; the landing-page snapshot is generated with
`bun run catalog:generate`.

The catalog follows the actively documented official mautrix bridges. It does
not include archived predecessors, temporary rewrite repositories, DeltaChat,
or the Twilio demonstration bridge. A bridge existing upstream does not mean it
is available in Claire: `supportStatus` is the product truth.

## Support classes

| Class             | Meaning                                                                                                                                 | Examples                                                            |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Phone pairing     | Setup is approved from the network's mobile app; Claire Desktop is not required                                                         | WhatsApp, Telegram, Signal, Discord                                 |
| Desktop setup     | Claire Desktop securely acquires a browser session and hands it directly to the selected bridge host; the desktop may close after setup | Instagram, Messenger, Google Chat, Google Voice, Slack, LinkedIn, X |
| Paired device     | A user-owned device remains part of delivery after setup                                                                                | iMessage on a Mac, Google Messages on Android                       |
| Direct credential | A revocable password, app password, API token, or network credential is supplied without a browser session                              | Bluesky, Zulip, IRC                                                 |

Google Messages belongs to both desktop setup and paired-device classes: the
desktop performs the Google sign-in, while the Android phone remains part of
message delivery.

## Delivery waves

1. **Current:** keep WhatsApp, Telegram, and Instagram reliable and expose
   their real connection health through the shared registry.
2. **Wave 1:** add Messenger, Signal, and Discord after the generic BridgeV2
   provisioning flow is stable.
3. **Parallel Mac track:** ship iMessage only after signed helper distribution,
   permissions, sleep/restart recovery, and bridge-health diagnostics pass.
4. **Wave 2:** add Google Messages, Google Chat, Google Voice, Slack, LinkedIn,
   and X using the desktop authentication broker. Keep the legacy Google Chat
   driver isolated behind the same connection interface.
5. **Wave 3:** add Bluesky, Zulip, and IRC using direct credential flows.

Each connector remains feature-flagged until authentication, initial sync,
send and receive, supported media, reauthentication, disconnect, and outage
recovery pass in its production deployment.

## Connection contract

`GET /platforms/definitions` is public and returns the product catalog. Runtime
connection records will reference the catalog by `platformId` and add:

- bridge instance and version;
- workspace deployment mode;
- execution location and host device, where applicable;
- status, last successful sync, and last error category;
- a secret-store reference, never raw credentials;
- the capability snapshot used to gate UI actions.

BridgeV2 networks should use the common provisioning API. Network-specific
drivers may translate authentication steps, ghost-user templates, bridge bot
identities, and capability reports, but must return the same Claire connection
state model. Instagram and Messenger run as separate mautrix-meta instances and
must remain independently revocable.

## Desktop authentication boundary

The desktop authentication broker owns contained browser sessions and native
secure storage. Browser-session material moves directly from native code to the
selected bridge provisioning service. It must never be stored in React state,
AsyncStorage, analytics, logs, ordinary Supabase rows, crash reports, or URL
parameters.

Cloud credentials belong in an encrypted secret store. Local credentials
belong in Keychain on macOS or Credential Manager on Windows. Disconnecting a
network revokes the credential where possible, removes the bridge login, clears
local secret material, and leaves message-history deletion as a separate,
explicit choice.

## Hosting and privacy

Deployment mode is account-wide for the first release:

- **Claire Cloud:** Claire hosts the server, Matrix homeserver, bridge services,
  database, search index, and configured AI integration. A desktop used only
  for authentication may close afterward. Device-dependent networks remain an
  exception.
- **Self-hosted:** the existing Docker stack runs on user-controlled
  infrastructure. Availability follows that host, and external AI providers
  still receive selected content when configured.
- **Private desktop-only:** remains an unreleased mode until local storage,
  search, embeddings, media, export, deletion, and recovery work without Claire
  cloud services.

The public site must not claim that data never reaches the cloud. Original
networks process their own messages in every mode. External AI is part of the
data boundary whenever enabled.

Private desktop-only mode can be promoted only when automated egress tests and
a production-binary review prove that message content, media, indexes,
embeddings, logs, notification bodies, and credentials do not reach Claire
services; telemetry and remote AI must be disabled by enforced configuration.

## Verification matrix

- Catalog contract: 16 unique IDs, accurate availability, desktop/device
  classification, and an exact generated landing snapshot.
- Landing experience: keyboard-operable filters and details, visible focus,
  reduced motion, screen-reader labels, and responsive layouts.
- Connector certification: authentication, backfill, send/receive, media and
  interactions where supported, reauthentication, disconnect, and recovery.
- Desktop security: secret redaction, secure-store persistence, revocation,
  process supervision, and actionable offline states.
- Hosting behavior: cloud operation with the desktop closed, iMessage with its
  Mac offline, Google Messages with its phone offline, and local-mode egress
  enforcement before any privacy guarantee.

## Upstream references

- [Official mautrix bridge catalog](https://github.com/mautrix/docs/blob/master/bridges/SUMMARY.md)
- [Meta bridge authentication](https://docs.mau.fi/bridges/go/meta/authentication.html)
- [iMessage connector overview](https://docs.mau.fi/bridges/go/imessage/)
- [Google Messages authentication](https://docs.mau.fi/bridges/go/gmessages/authentication.html)
