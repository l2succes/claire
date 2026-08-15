# Claire Desktop implementation specification

Status: design-complete proposal for implementation on a separate functionality branch.

## 1. Product decision

Claire Desktop is a complete messaging client. “Companion” is a capability inside that client, not a separate reduced product.

The app supports two simultaneous modes:

- **Standalone:** sign in, connect supported networks, read and send messages, search, manage promises and relationships, and configure Claire without a mobile device.
- **Companion:** continue drafts and searches from mobile, host Mac-only/on-device bridges, surface bridge health, and hand work between devices.

The visual reference is [`landing/desktop-mockups.html`](../landing/desktop-mockups.html).

Claire Desktop ships as one product on two native hosts:

- **React Native macOS** for macOS, including Mac-only companion features such
  as iMessage.
- **React Native Windows** for Windows, with the same full messaging, AI,
  search, promise, relationship, and connection-management experience.

The product must not present Windows as a reduced companion. Only individual
network capabilities vary by host.

## 2. Current technical constraint

The existing Expo client uses React Native `0.83.4`. As of August 2026,
`react-native-macos@0.81.9` has a `react-native@0.81.6` peer dependency,
whereas React Native Windows provides supported 0.83 and 0.84 release lines.
Each desktop host must therefore pin its own supported React Native pair.

Do **not** add `react-native-macos` or `react-native-windows` directly to
`client/`. Start with separate native hosts and share source packages that
remain inside a deliberately conservative React and React Native compatibility
envelope. The macOS and Windows hosts are one product release train, but they
are not required to share one lockfile or one exact React Native version.

Expo-module support on macOS is documented as experimental. Treat Expo modules
as opt-in per host after a compatibility spike; do not make them a dependency
of shared desktop packages.

Primary references:

- [React Native macOS introduction](https://microsoft.github.io/react-native-macos/docs/intro)
- [React Native macOS setup and version matching](https://microsoft.github.io/react-native-macos/docs/getting-started)
- [React Native macOS versioning](https://microsoft.github.io/react-native-macos/docs/category/contributing)
- [Experimental Expo module integration](https://microsoft.github.io/react-native-macos/docs/guides/installing-expo-modules)
- [React Native Windows getting started](https://microsoft.github.io/react-native-windows/docs/getting-started/)
- [React Native Windows support policy](https://microsoft.github.io/react-native-windows/support/)

## 3. Proposed repository topology

```text
claire/
├── client/                         # existing Expo iOS/Android/web application
├── desktop/
│   ├── macos/                      # RN macOS host: Xcode, Swift/AppKit modules
│   ├── windows/                    # RN Windows host: Visual Studio, C++/WinRT modules
│   ├── shared/                     # desktop-only navigation and pane composition
│   ├── bridge-host/                # typed companion-agent protocol and health UI
│   ├── package.json                # workspace manifest, no host-version assumptions
│   └── README.md
├── packages/
│   ├── design-system/              # semantic tokens and native primitives
│   ├── domain/                     # messages, chats, contacts, promises, search types
│   ├── platform-sdk/               # server API, Supabase, Matrix identifiers
│   └── state/                      # framework-neutral stores and query keys
├── server/
└── docker/
```

The first implementation PR should introduce the two host shells plus packages
that can be extracted without changing mobile behavior. Move existing mobile
code into shared packages incrementally, not as a prerequisite for the desktop
shell. Shared components must have no native-host imports; use `.macos.tsx` and
`.windows.tsx` variants only at the composition/native boundary.

## 4. Desktop information architecture

### Persistent navigation

| Destination | Purpose                                | macOS shortcut | Windows shortcut |
| ----------- | -------------------------------------- | -------------- | ---------------- |
| Home        | Daily brief, handoff, bridge health    | `⌘1`           | `Ctrl+1`         |
| Inbox       | Unified conversations and filters      | `⌘2`           | `Ctrl+2`         |
| Promises    | Open, waiting, overdue, completed      | `⌘3`           | `Ctrl+3`         |
| People      | Contacts and relationship memory       | `⌘4`           | `Ctrl+4`         |
| Search      | Global semantic search                 | `⌘K`           | `Ctrl+K`         |
| Connections | Network accounts and bridge health     | `⌘,`           | `Ctrl+,`         |
| Settings    | AI, notifications, appearance, privacy | `⌘,`           | `Ctrl+,`         |

### Window model

- Default minimum: `1,024 × 680` logical points/pixels.
- Preferred: `1,280 × 800` logical points/pixels.
- Wide layout: navigation rail + conversation list + content + inspector.
- Medium layout: inspector collapses first.
- Narrow layout: conversation list becomes a back-stack destination.
- Compact chat: independent resizable window, minimum `360 × 460`.
- Persist pane widths and window placement per device.

### Required screens and states

1. Account sign-in and device verification.
2. Desktop home / daily brief / handoff.
3. Unified inbox.
4. Chat with inline AI context and promise detection.
5. AI copilot sheet/popover.
6. Global command search and cited results.
7. Promise tracker.
8. People list and relationship memory editor.
9. Connections overview.
10. Per-network setup flows.
11. iMessage permission wizard.
12. Bridge health and reconnect diagnostics.
13. Settings: AI, notifications, appearance, shortcuts, privacy, updates.
14. Compact chat.
15. Empty, loading, offline, auth-expired, partial-sync, send-failed, and AI-unavailable states.

## 5. Application architecture

```mermaid
flowchart LR
    MacUI["React Native macOS UI"] --> SDK["Shared Claire platform SDK"]
    WinUI["React Native Windows UI"] --> SDK
    MacUI --> MacNative["Swift / AppKit modules"]
    WinUI --> WinNative["C++/WinRT modules"]
    SDK --> API["Bun server API"]
    SDK --> RT["Supabase Realtime"]
    API --> DB["Supabase PostgreSQL"]
    API --> Matrix["Synapse / Matrix"]
    MacNative --> Supervisor["Local companion-agent supervisor"]
    WinNative --> Supervisor
    Supervisor --> IM["mautrix-imessage / platform-imessage"]
    Supervisor --> Meta["Desktop-auth Meta connector"]
    IM --> WS["Appservice websocket proxy"]
    Meta --> WS
    WS --> Matrix
    Matrix --> API
```

### UI and state layers

- **Server state:** TanStack Query for chats, messages, people, promises, connections, and search results.
- **Realtime:** one authenticated subscription coordinator that invalidates query keys; do not let each screen create independent subscriptions.
- **Local UI state:** Zustand for pane state, filters, draft selection, window state, and command palette.
- **Durable local state:** host preferences for window and appearance settings;
  Keychain on macOS and Credential Locker/DPAPI on Windows for device tokens
  and local bridge secrets.
- **Drafts:** server-backed with optimistic local persistence so mobile/desktop handoff is reliable.

### Shared domain contracts

Extract these first from existing client/server types:

- `Platform`, `PlatformStatus`, `AuthMethod`, and platform capabilities.
- `UnifiedMessage`, `Conversation`, `Contact`, `Promise`, and `SearchResult`.
- Query keys and API response schemas.
- Date/message formatting and urgency utilities.

No shared package may import Expo Router, UIKit-only modules, AppKit, or a screen component.

## 6. Connection architecture

Claire should follow the same broad Matrix-puppeting pattern as Beeper: each external network is normalized by a bridge into Matrix rooms and events. Beeper publicly documents bridges for WhatsApp, Telegram, Meta, Signal, Discord, Slack, LinkedIn, Google Messages, Google Chat, X, and others. The design should therefore accept a capability-driven connection registry instead of hard-coding four platforms. [Beeper’s public bridge list](https://github.com/beeper) is the reference for expansion, not a promise that Claire supports each network today.

### Connection classes

| Class                 | Examples                             | Where auth occurs                                   | Runtime dependency                                                         |
| --------------------- | ------------------------------------ | --------------------------------------------------- | -------------------------------------------------------------------------- |
| Cloud bridge          | WhatsApp, Telegram                   | Desktop or mobile control flow                      | Claire bridge infrastructure                                               |
| Desktop-authenticated | Instagram/Meta                       | Secure desktop flow on macOS or Windows             | Desktop companion agent and connection broker                              |
| On-device Mac bridge  | iMessage                             | macOS permissions on the host Mac                   | macOS Claire Desktop and local bridge supervisor must remain available     |
| Future local bridge   | privacy-sensitive self-hosted bridge | Desktop                                             | Local helper + websocket appservice proxy                                  |

### iMessage

The recommended first implementation is a supervised local `mautrix-imessage` process using its normal Mac connector. Official mautrix documentation says this connector reads the Messages SQLite database, uses AppleScript for sends, and uses Contacts.framework; setup requires Full Disk Access and an appservice websocket proxy. Beeper’s current Mac flow additionally requires Accessibility, Contacts, Messages Data, and Automation permissions. References:

- [mautrix-imessage connector overview](https://docs.mau.fi/bridges/go/imessage/)
- [mautrix-imessage Mac setup](https://docs.mau.fi/bridges/go/imessage/mac/setup.html)
- [Beeper’s current iMessage-on-Mac setup](https://help.beeper.com/en_US/chat-networks/new-imessage-on-macos-getting-started-guide)
- [Beeper platform-imessage automation library](https://github.com/beeper/platform-imessage)

Do not implement iMessage database access in JavaScript. Use a signed helper/bridge process managed by a Swift native module.

Required native responsibilities:

- Detect Messages.app account availability.
- Check and deep-link to relevant TCC permission panes.
- Start, stop, update, and health-check the local bridge.
- Authenticate loopback/XPC communication.
- Redact secrets and message contents from logs.
- Publish capability and health events to the React Native layer.
- Recover after Mac restart using a user-approved LaunchAgent.

### Instagram

The existing server expects `login-cookie`. The desktop flow should replace manual cookie pasting with a contained authentication window or approved browser-assisted handoff. Session material must move directly from native authentication code to the bridge API and never pass through analytics, console logs, Zustand, AsyncStorage, or component props.

Beeper’s current desktop flow opens a login window, while its browser extension can use an already signed-in browser session for Instagram, Messenger, LinkedIn, and X. Claire should begin with a desktop-only authentication proof on both macOS and Windows, and keep browser-extension support as a later enhancement. The proof must establish a supportable login method with the bridge before it is shown in product UI; neither mobile nor web may ask for browser cookies, cURL commands, or developer-tools actions. [Beeper Instagram setup](https://help.beeper.com/instagram), [Beeper browser extension](https://help.beeper.com/en_US/desktop/beeper-browser-extension).

### Companion-agent and device pairing protocol

Every desktop installation is a full Claire client and, when required, a
companion host. A network connection is associated with its host device rather
than with an arbitrary mobile/web session.

1. The desktop app signs in to Claire and creates a device record with a
   per-install public key and declared capabilities.
2. The server displays a short-lived approval request on the user's existing
   Claire sessions, or completes direct approval during desktop sign-in.
3. The server returns a device-scoped, revocable credential to the native
   secure store. The React Native layer receives only connection health and
   capability state.
4. The local companion agent opens outbound authenticated connections to the
   Claire connection broker; it never exposes a public local HTTP server.
5. The agent reports heartbeats, sync checkpoints, auth expiry, and structured
   diagnostics. It sends normalized events through the broker, which enforces
   the user/device/connection binding before Matrix or database ingestion.
6. Disconnecting a platform revokes its agent credential, stops its local
   helper, and leaves imported history under the user's separate data-retention
   controls.

The first protocol version should use device-bound public-key proof plus a
rotating device refresh credential stored in Keychain on macOS and Credential
Locker/DPAPI on Windows. Do not store bridge sessions or raw login material in
JavaScript, AsyncStorage, Zustand, logs, or the normal mobile API session.

### Capability registry

Replace display-only platform conditionals with a registry delivered by the server:

```ts
interface ConnectionDefinition {
  id: string;
  displayName: string;
  iconKey: string;
  connectionClass: 'cloud' | 'desktop_auth' | 'on_device';
  supportedHosts: Array<'ios' | 'android' | 'macos' | 'web'>;
  authFlow: 'qr' | 'phone_code' | 'oauth' | 'web_session' | 'native_permissions';
  capabilities: PlatformCapabilities;
  beta?: boolean;
  requiresHostOnline?: boolean;
}
```

The desktop UI renders connection cards and setup steps from this definition plus session state.

## 7. Native desktop surfaces

### Shared native responsibilities

Implement the following behind matching Swift/AppKit and C++/WinRT interfaces
rather than attempting to simulate them in JavaScript:

- Secure device credential storage.
- Local companion-agent start, stop, update, and health reporting.
- Native notifications and unread badges.
- Desktop protocol/deep-link handling for connection approval.
- Window lifecycle, menu/command registration, and system accessibility state.
- Sanitized diagnostics export with explicit user review.

### macOS-only responsibilities

- Application menu and dynamic keyboard commands.
- Dock badge and unread count.
- User notifications with inline reply where supported.
- Keychain access and device-key generation.
- Window creation, compact-mode window, restoration, and always-on-top preference.
- Local iMessage bridge process supervisor and user-approved LaunchAgent.
- TCC permission status/deep links.
- File open/save panels and drag-and-drop URLs.
- Share extension in a later milestone.

Distribution should initially target Developer ID signing and notarization outside the Mac App Store. iMessage automation, Full Disk Access, and local helper processes are likely incompatible with a conventional sandboxed App Store distribution; validate this with an entitlement spike before promising an App Store build.

### Windows-only responsibilities

- Credential Locker/DPAPI storage and device-key protection.
- Windows App SDK notification, unread badge, jump-list, and protocol-handler
  integration.
- C++/WinRT process supervision for desktop-authenticated connectors.
- Installer/update integration and safe recovery after Windows restart.
- Explicit capability state explaining that iMessage requires a Mac host; the
  Windows app can still display, search, send through, and monitor an iMessage
  connection hosted by one of the user's Macs.

## 8. React Native desktop bootstrap

### Compatibility spikes

1. Create a disposable RN macOS app using the current matching React Native / React Native macOS pair (currently the 0.81 line).
2. Create a disposable RN Windows app using a supported React Native Windows pair. Prefer the currently active stable line for the Windows host, not an unsupported canary.
3. Render the same design-system primitives in both hosts and establish Metro, TypeScript, React Query, and a shared-package build.
4. Audit every dependency used by shared packages across iOS, Android, web, macOS, and Windows.
5. Prove signed native event emitters: Swift on macOS and C++/WinRT on Windows.
6. Decide whether each host can consume any Expo modules. The default should be **no Expo modules** until each dependency is proven.
7. Record the selected version pairs and supported feature envelope in a compatibility ADR before building product screens.

### Expected commands

```bash
# macOS host: substitute the currently compatible macOS pair after the spike.
npx @react-native-community/cli init ClaireDesktopMac --version <rn-macos-peer-version>
cd ClaireDesktopMac
npx react-native-macos-init
npx react-native run-macos

# Windows host: use a supported react-native-windows pair after the spike.
npx @react-native-community/cli init ClaireDesktopWindows --version <rn-windows-peer-version>
cd ClaireDesktopWindows
npx react-native init-windows --overwrite
npx react-native run-windows
```

Microsoft documents `run-macos`, `build-macos`, and Xcode workspace workflows in the [official CLI guide](https://microsoft.github.io/react-native-macos/docs/cli-commands).

### Dependency policy

- Match the `react-native` and `react-native-macos` minor versions exactly.
- Prefer libraries that explicitly advertise macOS and Windows support, or keep
  their host-specific use behind a narrow adapter.
- Wrap platform dependencies behind interfaces in `packages/platform-sdk`.
- Use `.macos.tsx` and `.windows.tsx` for native divergence, not runtime forests
  of `Platform.OS` conditions.
- Keep the desktop navigators independent from Expo Router until both host
  compatibility spikes are proven.

## 9. Server and database work

Add or formalize:

| Area        | Change                                                                           |
| ----------- | -------------------------------------------------------------------------------- |
| Devices     | `devices` table: id, user, host, name, public key, capabilities, last_seen, push token |
| Handoff     | `drafts` and `continuation_activity` with optimistic version fields              |
| Connections | host device id, connection class, bridge version, health, last sync, auth expiry |
| Search      | unified endpoint returning cited messages, people, files, and promises           |
| Presence    | ephemeral device/bridge health through Redis + Realtime                          |
| Permissions | no raw TCC data; store only capability status and timestamps                     |

Suggested endpoints:

```text
GET    /api/desktop/bootstrap
POST   /api/devices/enroll
POST   /api/devices/:id/approve
DELETE /api/devices/:id
GET    /api/connections/definitions
GET    /api/connections
POST   /api/connections/:platform/start
POST   /api/connections/:id/complete
POST   /api/connections/:id/heartbeat
GET    /api/connections/:id/diagnostics
GET    /api/search?q=&scope=&cursor=
GET    /api/drafts
PUT    /api/drafts/:conversationId
POST   /api/handoff/:activityId/claim
```

All endpoints require user authentication and device identity. Diagnostics must return structured codes, not raw bridge logs.

## 10. Keyboard, pointer, and accessibility requirements

- Full keyboard traversal with a visible `#3C68FF` focus ring.
- macOS: `⌘K` search, `⌘N` compose, `⌘,` settings, `⌘1–4` destinations, and `⌘⇧M` compact mode.
- Windows: `Ctrl+K` search, `Ctrl+N` compose, `Ctrl+,` settings, `Ctrl+1–4` destinations, and `Ctrl+Shift+M` compact mode.
- Context menus for conversations, messages, files, and promises.
- Multi-select and bulk actions in inbox/search where platform capabilities allow them.
- Minimum pointer target: 28 points; preferred primary control: 32–36 points.
- Support system text scaling without truncating message content.
- VoiceOver labels may include platform only after the person/message label.
- Never rely on platform color alone for identity or bridge health.
- Respect Reduce Motion, Increase Contrast, and Reduce Transparency.

## 11. Security requirements

- Store tokens and local bridge secrets in Keychain (macOS) or Credential
  Locker/DPAPI (Windows), never JavaScript persistence.
- Use authenticated XPC on macOS and an authenticated named-pipe or equivalent
  OS IPC channel on Windows. A random per-install bearer token is acceptable
  only for a loopback endpoint with strict origin rejection.
- Bind any loopback APIs to `127.0.0.1` only and reject browser origins by default.
- Sign and verify bridge/helper updates.
- Sanitize exported diagnostics and require user review before upload.
- Do not include message content, cookies, phone numbers, or tokens in analytics.
- Show whether every connection is cloud, desktop-authenticated, or on-device.
- Provide “disconnect and delete local session” separately from “remove Matrix history.”

## 12. Delivery plan

### Phase 0 — Compatibility and entitlements spikes (1–2 weeks)

- Supported RN macOS and RN Windows apps launch and render identical shared tokens.
- Swift/Keychain and C++/WinRT/Credential Locker native-event proofs.
- macOS TCC permission detection proof.
- Device-pairing protocol proof with one revocable desktop device.
- Decision record for host version pairs, shared-package compatibility, navigation,
  Expo modules, distribution, and update strategy.

### Phase 1 — Desktop shells (1–2 weeks)

- macOS and Windows window/menu commands, navigation rail, resizable panes.
- Auth, server bootstrap, theme primitives.
- Inbox and chat read-only data.

### Phase 2 — Full client loop (2–3 weeks)

- Compose/send, attachments, reactions according to platform capability.
- Global search, promises, people, relationship memory.
- Desktop notifications, drafts, keyboard shortcuts.

### Phase 3 — Companion features (1–2 weeks)

- Device registry, pairing approval, draft handoff, continuation activity.
- Compact chat and bridge-health home modules.

### Phase 4 — Connections (2–4 weeks)

- Cloud bridge setup parity for WhatsApp and Telegram.
- Secure Instagram desktop authentication.
- Capability-driven connection registry and recovery UI.

### Phase 5 — iMessage local bridge (3–5 weeks)

- Signed bridge bundle, supervisor, permissions, wsproxy/appservice connection.
- Restart/update/diagnostics flows.
- Send, receive, backfill, contacts, and failure recovery.

### Phase 6 — hardening and distribution (2 weeks)

- Accessibility, performance, crash recovery, migration, signing/notarization.
- Release update channel and rollback.

The functionality branch should treat phase estimates as sequencing guides, not commitments, until Phase 0 resolves version and entitlement risk.

## 13. Acceptance criteria

### Full client

- A user can use Claire Desktop on macOS or Windows from sign-in through sending a message without mobile.
- Inbox updates arrive within two seconds of server receipt under normal conditions.
- Search returns source-backed results across all connected platforms.
- Pane widths, selected conversation, drafts, and window position restore after restart.
- Every platform action is gated by declared capability.

### Companion

- Desktop can claim and continue a mobile draft without overwriting a newer version.
- The mobile app can see whether a Mac-only bridge is online.
- A local bridge outage produces an actionable state, not silent missing messages.
- Compact chat opens/closes from a shortcut and retains the active conversation.

### Host-specific capability behavior

- macOS can host iMessage after every required local permission is granted.
- Windows never advertises iMessage setup as locally available, but it can use a
  connected iMessage account hosted by the user's paired Mac.
- Instagram setup appears only when the desktop authentication proof has
  passed for that host; otherwise the app shows an honest unavailable state.

### iMessage

- Permission state is verified independently for each required macOS capability.
- The bridge restarts after user login only when the user opted in.
- No raw message database path, token, or message content appears in diagnostics.
- Removing the connection stops the helper and deletes local bridge credentials.

## 14. Test strategy

- Unit: reducers/stores, capability decisions, bridge-state normalization, search result mapping.
- Component: all pane breakpoints, focus order, context menus, error states.
- Contract: server schemas shared between desktop and server.
- Integration: mock Matrix sync, auth expiry, send retry, draft conflict.
- Native integration: Keychain, notifications, TCC status, process supervisor.
- End-to-end: sign in → connect network → sync → search → send → handoff.
- Soak: 100k messages, 5k rooms, 24-hour sync, Mac sleep/wake, network change.

## 15. Risks and mitigations

| Risk                              | Mitigation                                                               |
| --------------------------------- | ------------------------------------------------------------------------ |
| RN macOS and RN Windows track different RN minors | Separate native hosts; compatibility ADR; share source packages only |
| Expo modules are experimental     | Avoid them in desktop MVP; prove modules individually                    |
| iMessage permissions/distribution | Phase 0 entitlement spike; Developer ID distribution                     |
| Local bridge offline              | Health heartbeat, explicit host status, mobile warning                   |
| Instagram session expiry          | Structured re-auth flow and expiry status                                |
| Feature mismatch across networks  | Capability registry controls UI and actions                              |
| Four-pane performance             | Virtualized lists, memoized rows, incremental search, bounded inspectors |
| Security of local helper          | Signed binary, Keychain, authenticated XPC/loopback, redacted logs       |
