// SPDX-License-Identifier: Apache-2.0
import { C, Code, Diagram, Doc, P, Section, Table } from '@/components/docs/blocks';
import type { DocMeta } from '@/lib/docs-types';

export const meta: DocMeta = {
  title: "Desktop implementation specification",
  description: "Architecture and delivery plan for Claire Desktop and its native companion bridge.",
  section: 'build-claire',
  status: 'draft',
  lastReviewed: '2026-08-17',
  order: 7,
  roadmap: {
    status: 'planned',
    summary: "Expand the signed native companion and cross-platform desktop experience.",
  },
  hero: { kind: 'mockup', surface: 'desktop', screen: 'desktop-home', caption: 'Desktop home, with companion and standalone status' },
  related: ['/docs/build-claire/desktop', '/docs/get-started/companion-app'],
};

export default function Page() {
  return (
    <Doc>
      <P lede>Status: design-complete proposal for implementation on a separate functionality branch.</P>
      <Section id="product-decision" title="Product decision">
      <P>Claire Desktop is a complete messaging client. “Companion” is a capability inside that client, not a separate reduced product.</P>
      <P>The app supports two simultaneous modes:</P>
      <ul>
              <li><b>Standalone:</b> sign in, connect supported networks, read and send messages, search, manage loops and relationships, and configure Claire without a mobile device.</li>
              <li><b>Companion:</b> continue drafts and searches from mobile, host Mac-only/on-device bridges, surface bridge health, and hand work between devices.</li>
            </ul>
      <P>The visual reference is the <a href="/mockups/desktop">public desktop mockups</a>.</P>
      <P>Claire Desktop ships as one product on two native hosts:</P>
      <ul>
              <li><b>React Native macOS</b> for macOS, including Mac-only companion features such as iMessage.</li>
              <li><b>React Native Windows</b> for Windows, with the same full messaging, AI, search, loop, relationship, and connection-management experience.</li>
            </ul>
      <P>The product must not present Windows as a reduced companion. Only individual network capabilities vary by host.</P>
      </Section>
      <Section id="current-technical-constraint" title="Current technical constraint">
      <P>The existing Expo client uses React Native <C>0.83.4</C>. As of August 2026, <C>react-native-macos@0.81.9</C> has a <C>react-native@0.81.6</C> peer dependency, whereas React Native Windows provides supported 0.83 and 0.84 release lines. Each desktop host must therefore pin its own supported React Native pair.</P>
      <P>Do <b>not</b> add <C>react-native-macos</C> or <C>react-native-windows</C> directly to <C>mobile/</C>. Start with separate native hosts and share source packages that remain inside a deliberately conservative React and React Native compatibility envelope. The macOS and Windows hosts are one product release train, but they are not required to share one lockfile or one exact React Native version.</P>
      <P>Expo-module support on macOS is documented as experimental. Treat Expo modules as opt-in per host after a compatibility spike; do not make them a dependency of shared desktop packages.</P>
      <P>Primary references:</P>
      <ul>
              <li><a href="https://microsoft.github.io/react-native-macos/docs/intro" rel="noreferrer" target="_blank">React Native macOS introduction</a></li>
              <li><a href="https://microsoft.github.io/react-native-macos/docs/getting-started" rel="noreferrer" target="_blank">React Native macOS setup and version matching</a></li>
              <li><a href="https://microsoft.github.io/react-native-macos/docs/category/contributing" rel="noreferrer" target="_blank">React Native macOS versioning</a></li>
              <li><a href="https://microsoft.github.io/react-native-macos/docs/guides/installing-expo-modules" rel="noreferrer" target="_blank">Experimental Expo module integration</a></li>
              <li><a href="https://microsoft.github.io/react-native-windows/docs/getting-started/" rel="noreferrer" target="_blank">React Native Windows getting started</a></li>
              <li><a href="https://microsoft.github.io/react-native-windows/support/" rel="noreferrer" target="_blank">React Native Windows support policy</a></li>
            </ul>
      </Section>
      <Section id="proposed-repository-topology" title="Proposed repository topology">
      <Code lang="text">{"claire/\n├── apps/client/                         # existing Expo iOS/Android/web application\n├── desktop/\n│   ├── macos/                      # RN macOS host: Xcode, Swift/AppKit modules\n│   ├── windows/                    # RN Windows host: Visual Studio, C++/WinRT modules\n│   ├── shared/                     # desktop-only navigation and pane composition\n│   ├── bridge-host/                # typed companion-agent protocol and health UI\n│   ├── package.json                # workspace manifest, no host-version assumptions\n│   └── README.md\n├── packages/\n│   ├── design-system/              # semantic tokens and native primitives\n│   ├── domain/                     # messages, chats, contacts, loops, search types\n│   ├── platform-sdk/               # server API, Supabase, Matrix identifiers\n│   └── state/                      # framework-neutral stores and query keys\n├── server/\n└── docker/"}</Code>
      <P>The first implementation PR should introduce the two host shells plus packages that can be extracted without changing mobile behavior. Move existing mobile code into shared packages incrementally, not as a prerequisite for the desktop shell. Shared components must have no native-host imports; use <C>.macos.tsx</C> and <C>.windows.tsx</C> variants only at the composition/native boundary.</P>
      </Section>
      <Section id="desktop-information-architecture" title="Desktop information architecture">
      <Section id="persistent-navigation" title="Persistent navigation" level={3}>
      <Table
              head={[<>Destination</>, <>Purpose</>, <>macOS shortcut</>, <>Windows shortcut</>]}
              rows={[
                [<>Home</>, <>Daily brief, handoff, bridge health</>, <><C>⌘1</C></>, <><C>Ctrl+1</C></>],
                [<>Inbox</>, <>Unified conversations and filters</>, <><C>⌘2</C></>, <><C>Ctrl+2</C></>],
                [<>Loops</>, <>Open, waiting, snoozed, done</>, <><C>⌘3</C></>, <><C>Ctrl+3</C></>],
                [<>People</>, <>Contacts and relationship memory</>, <><C>⌘4</C></>, <><C>Ctrl+4</C></>],
                [<>Search</>, <>Global semantic search</>, <><C>⌘K</C></>, <><C>Ctrl+K</C></>],
                [<>Connections</>, <>Network accounts and bridge health</>, <><C>⌘,</C></>, <><C>Ctrl+,</C></>],
                [<>Settings</>, <>AI, notifications, appearance, privacy</>, <><C>⌘,</C></>, <><C>Ctrl+,</C></>],
              ]}
            />
      </Section>
      <Section id="window-model" title="Window model" level={3}>
      <ul>
              <li>Default minimum: <C>1,024 × 680</C> logical points/pixels.</li>
              <li>Preferred: <C>1,280 × 800</C> logical points/pixels.</li>
              <li>Wide layout: navigation rail + conversation list + content + inspector.</li>
              <li>Medium layout: inspector collapses first.</li>
              <li>Narrow layout: conversation list becomes a back-stack destination.</li>
              <li>Compact chat: independent resizable window, minimum <C>360 × 460</C>.</li>
              <li>Persist pane widths and window placement per device.</li>
            </ul>
      </Section>
      <Section id="required-screens-and-states" title="Required screens and states" level={3}>
      <ol>
              <li>Account sign-in and device verification.</li>
              <li>Desktop home / daily brief / handoff.</li>
              <li>Unified inbox.</li>
              <li>Chat with inline AI context and loop detection.</li>
              <li>AI copilot sheet/popover.</li>
              <li>Global command search and cited results.</li>
              <li>Loop tracker.</li>
              <li>People list and relationship memory editor.</li>
              <li>Connections overview.</li>
              <li>Per-network setup flows.</li>
              <li>iMessage permission wizard.</li>
              <li>Bridge health and reconnect diagnostics.</li>
              <li>Settings: AI, notifications, appearance, shortcuts, privacy, updates.</li>
              <li>Compact chat.</li>
              <li>Empty, loading, offline, auth-expired, partial-sync, send-failed, and AI-unavailable states.</li>
            </ol>
      </Section>
      </Section>
      <Section id="application-architecture" title="Application architecture">
      <Diagram>{"flowchart LR\n    MacUI[\"React Native macOS UI\"] --> SDK[\"Shared Claire platform SDK\"]\n    WinUI[\"React Native Windows UI\"] --> SDK\n    MacUI --> MacNative[\"Swift / AppKit modules\"]\n    WinUI --> WinNative[\"C++/WinRT modules\"]\n    SDK --> API[\"Bun server API\"]\n    SDK --> RT[\"Supabase Realtime\"]\n    API --> DB[\"Supabase PostgreSQL\"]\n    API --> Matrix[\"Synapse / Matrix\"]\n    MacNative --> Supervisor[\"Local companion-agent supervisor\"]\n    WinNative --> Supervisor\n    Supervisor --> IM[\"mautrix-imessage / platform-imessage\"]\n    Supervisor --> Meta[\"Desktop-auth Meta connector\"]\n    IM --> WS[\"Appservice websocket proxy\"]\n    Meta --> WS\n    WS --> Matrix\n    Matrix --> API"}</Diagram>
      <Section id="ui-and-state-layers" title="UI and state layers" level={3}>
      <ul>
              <li><b>Server state:</b> TanStack Query for chats, messages, people, loops, connections, and search results.</li>
              <li><b>Realtime:</b> one authenticated subscription coordinator that invalidates query keys; do not let each screen create independent subscriptions.</li>
              <li><b>Local UI state:</b> Zustand for pane state, filters, draft selection, window state, and command palette.</li>
              <li><b>Durable local state:</b> host preferences for window and appearance settings; Keychain on macOS and Credential Locker/DPAPI on Windows for device tokens and local bridge secrets.</li>
              <li><b>Drafts:</b> server-backed with optimistic local persistence so mobile/desktop handoff is reliable.</li>
            </ul>
      </Section>
      <Section id="shared-domain-contracts" title="Shared domain contracts" level={3}>
      <P>Extract these first from existing client/server types:</P>
      <ul>
              <li><C>Platform</C>, <C>PlatformStatus</C>, <C>AuthMethod</C>, and platform capabilities.</li>
              <li><C>UnifiedMessage</C>, <C>Conversation</C>, <C>Contact</C>, <C>Promise</C>, and <C>SearchResult</C>.</li>
              <li>Query keys and API response schemas.</li>
              <li>Date/message formatting and urgency utilities.</li>
            </ul>
      <P>No shared package may import Expo Router, UIKit-only modules, AppKit, or a screen component.</P>
      </Section>
      </Section>
      <Section id="connection-architecture" title="Connection architecture">
      <P>Claire should follow the same broad Matrix-puppeting pattern as Beeper: each external network is normalized by a bridge into Matrix rooms and events. Beeper publicly documents bridges for WhatsApp, Telegram, Meta, Signal, Discord, Slack, LinkedIn, Google Messages, Google Chat, X, and others. The design should therefore accept a capability-driven connection registry instead of hard-coding four platforms. <a href="https://github.com/beeper" rel="noreferrer" target="_blank">Beeper’s public bridge list</a> is the reference for expansion, not a promise that Claire supports each network today.</P>
      <Section id="connection-classes" title="Connection classes" level={3}>
      <Table
              head={[<>Class</>, <>Examples</>, <>Where auth occurs</>, <>Runtime dependency</>]}
              rows={[
                [<>Cloud bridge</>, <>WhatsApp, Telegram</>, <>Desktop or mobile control flow</>, <>Claire bridge infrastructure</>],
                [<>Desktop-authenticated</>, <>Instagram/Meta</>, <>Secure desktop flow on macOS or Windows</>, <>Desktop companion agent and connection broker</>],
                [<>On-device Mac bridge</>, <>iMessage</>, <>macOS permissions on the host Mac</>, <>macOS Claire Desktop and local bridge supervisor must remain available</>],
                [<>Future local bridge</>, <>privacy-sensitive self-hosted bridge</>, <>Desktop</>, <>Local helper + websocket appservice proxy</>],
              ]}
            />
      </Section>
      <Section id="imessage" title="iMessage" level={3}>
      <P>The recommended first implementation is a supervised local <C>mautrix-imessage</C> process using its normal Mac connector. Official mautrix documentation says this connector reads the Messages SQLite database, uses AppleScript for sends, and uses Contacts.framework; setup requires Full Disk Access and an appservice websocket proxy. Beeper’s current Mac flow additionally requires Accessibility, Contacts, Messages Data, and Automation permissions. References:</P>
      <ul>
              <li><a href="https://docs.mau.fi/bridges/go/imessage/" rel="noreferrer" target="_blank">mautrix-imessage connector overview</a></li>
              <li><a href="https://docs.mau.fi/bridges/go/imessage/mac/setup.html" rel="noreferrer" target="_blank">mautrix-imessage Mac setup</a></li>
              <li><a href="https://help.beeper.com/en_US/chat-networks/new-imessage-on-macos-getting-started-guide" rel="noreferrer" target="_blank">Beeper’s current iMessage-on-Mac setup</a></li>
              <li><a href="https://github.com/beeper/platform-imessage" rel="noreferrer" target="_blank">Beeper platform-imessage automation library</a></li>
            </ul>
      <P>Do not implement iMessage database access in JavaScript. Use a signed helper/bridge process managed by a Swift native module.</P>
      <P>Required native responsibilities:</P>
      <ul>
              <li>Detect Messages.app account availability.</li>
              <li>Check and deep-link to relevant TCC permission panes.</li>
              <li>Start, stop, update, and health-check the local bridge.</li>
              <li>Authenticate loopback/XPC communication.</li>
              <li>Redact secrets and message contents from logs.</li>
              <li>Publish capability and health events to the React Native layer.</li>
              <li>Recover after Mac restart using a user-approved LaunchAgent.</li>
            </ul>
      </Section>
      <Section id="instagram" title="Instagram" level={3}>
      <P>The existing server expects <C>login-cookie</C>. The desktop flow should replace manual cookie pasting with a contained authentication window or approved browser-assisted handoff. Session material must move directly from native authentication code to the bridge API and never pass through analytics, console logs, Zustand, AsyncStorage, or component props.</P>
      <P>Beeper’s current desktop flow opens a login window, while its browser extension can use an already signed-in browser session for Instagram, Messenger, LinkedIn, and X. Claire should begin with a desktop-only authentication proof on both macOS and Windows, and keep browser-extension support as a later enhancement. The proof must establish a supportable login method with the bridge before it is shown in product UI; neither mobile nor web may ask for browser cookies, cURL commands, or developer-tools actions. <a href="https://help.beeper.com/instagram" rel="noreferrer" target="_blank">Beeper Instagram setup</a>, <a href="https://help.beeper.com/en_US/desktop/beeper-browser-extension" rel="noreferrer" target="_blank">Beeper browser extension</a>.</P>
      </Section>
      <Section id="companion-agent-and-device-pairing-protocol" title="Companion-agent and device pairing protocol" level={3}>
      <P>Every desktop installation is a full Claire client and, when required, a companion host. A network connection is associated with its host device rather than with an arbitrary mobile/web session.</P>
      <ol>
              <li>The desktop app signs in to Claire and creates a device record with a per-install public key and declared capabilities.</li>
              <li>{"The server displays a short-lived approval request on the user's existing Claire sessions, or completes direct approval during desktop sign-in."}</li>
              <li>The server returns a device-scoped, revocable credential to the native secure store. The React Native layer receives only connection health and capability state.</li>
              <li>The local companion agent opens outbound authenticated connections to the Claire connection broker; it never exposes a public local HTTP server.</li>
              <li>The agent reports heartbeats, sync checkpoints, auth expiry, and structured diagnostics. It sends normalized events through the broker, which enforces the user/device/connection binding before Matrix or database ingestion.</li>
              <li>{"Disconnecting a platform revokes its agent credential, stops its local helper, and leaves imported history under the user's separate data-retention controls."}</li>
            </ol>
      <P>The first protocol version should use device-bound public-key proof plus a rotating device refresh credential stored in Keychain on macOS and Credential Locker/DPAPI on Windows. Do not store bridge sessions or raw login material in JavaScript, AsyncStorage, Zustand, logs, or the normal mobile API session.</P>
      </Section>
      <Section id="capability-registry" title="Capability registry" level={3}>
      <P>Replace display-only platform conditionals with a registry delivered by the server:</P>
      <Code lang="ts">{"interface ConnectionDefinition {\n  id: string;\n  displayName: string;\n  iconKey: string;\n  connectionClass: 'cloud' | 'desktop_auth' | 'on_device';\n  supportedHosts: Array<'ios' | 'android' | 'macos' | 'web'>;\n  authFlow: 'qr' | 'phone_code' | 'oauth' | 'web_session' | 'native_permissions';\n  capabilities: PlatformCapabilities;\n  beta?: boolean;\n  requiresHostOnline?: boolean;\n}"}</Code>
      <P>The desktop UI renders connection cards and setup steps from this definition plus session state.</P>
      </Section>
      </Section>
      <Section id="native-desktop-surfaces" title="Native desktop surfaces">
      <Section id="shared-native-responsibilities" title="Shared native responsibilities" level={3}>
      <P>Implement the following behind matching Swift/AppKit and C++/WinRT interfaces rather than attempting to simulate them in JavaScript:</P>
      <ul>
              <li>Secure device credential storage.</li>
              <li>Local companion-agent start, stop, update, and health reporting.</li>
              <li>Native notifications and unread badges.</li>
              <li>Desktop protocol/deep-link handling for connection approval.</li>
              <li>Window lifecycle, menu/command registration, and system accessibility state.</li>
              <li>Sanitized diagnostics export with explicit user review.</li>
            </ul>
      </Section>
      <Section id="macos-only-responsibilities" title="macOS-only responsibilities" level={3}>
      <ul>
              <li>Application menu and dynamic keyboard commands.</li>
              <li>Dock badge and unread count.</li>
              <li>User notifications with inline reply where supported.</li>
              <li>Keychain access and device-key generation.</li>
              <li>Window creation, compact-mode window, restoration, and always-on-top preference.</li>
              <li>Local iMessage bridge process supervisor and user-approved LaunchAgent.</li>
              <li>TCC permission status/deep links.</li>
              <li>File open/save panels and drag-and-drop URLs.</li>
              <li>Share extension in a later milestone.</li>
            </ul>
      <P>Distribution should initially target Developer ID signing and notarization outside the Mac App Store. iMessage automation, Full Disk Access, and local helper processes are likely incompatible with a conventional sandboxed App Store distribution; validate this with an entitlement spike before promising an App Store build.</P>
      </Section>
      <Section id="windows-only-responsibilities" title="Windows-only responsibilities" level={3}>
      <ul>
              <li>Credential Locker/DPAPI storage and device-key protection.</li>
              <li>Windows App SDK notification, unread badge, jump-list, and protocol-handler integration.</li>
              <li>C++/WinRT process supervision for desktop-authenticated connectors.</li>
              <li>Installer/update integration and safe recovery after Windows restart.</li>
              <li>{"Explicit capability state explaining that iMessage requires a Mac host; the Windows app can still display, search, send through, and monitor an iMessage connection hosted by one of the user's Macs."}</li>
            </ul>
      </Section>
      </Section>
      <Section id="react-native-desktop-bootstrap" title="React Native desktop bootstrap">
      <Section id="compatibility-spikes" title="Compatibility spikes" level={3}>
      <ol>
              <li>Create a disposable RN macOS app using the current matching React Native / React Native macOS pair (currently the 0.81 line).</li>
              <li>Create a disposable RN Windows app using a supported React Native Windows pair. Prefer the currently active stable line for the Windows host, not an unsupported canary.</li>
              <li>Render the same design-system primitives in both hosts and establish Metro, TypeScript, React Query, and a shared-package build.</li>
              <li>Audit every dependency used by shared packages across iOS, Android, web, macOS, and Windows.</li>
              <li>Prove signed native event emitters: Swift on macOS and C++/WinRT on Windows.</li>
              <li>Decide whether each host can consume any Expo modules. The default should be <b>no Expo modules</b> until each dependency is proven.</li>
              <li>Record the selected version pairs and supported feature envelope in a compatibility ADR before building product screens.</li>
            </ol>
      </Section>
      <Section id="expected-commands" title="Expected commands" level={3}>
      <Code lang="bash">{"# macOS host: substitute the currently compatible macOS pair after the spike.\nnpx @react-native-community/cli init ClaireDesktopMac --version <rn-macos-peer-version>\ncd ClaireDesktopMac\nnpx react-native-macos-init\nnpx react-native run-macos\n\n# Windows host: use a supported react-native-windows pair after the spike.\nnpx @react-native-community/cli init ClaireDesktopWindows --version <rn-windows-peer-version>\ncd ClaireDesktopWindows\nnpx react-native init-windows --overwrite\nnpx react-native run-windows"}</Code>
      <P>Microsoft documents <C>run-macos</C>, <C>build-macos</C>, and Xcode workspace workflows in the <a href="https://microsoft.github.io/react-native-macos/docs/cli-commands" rel="noreferrer" target="_blank">official CLI guide</a>.</P>
      </Section>
      <Section id="dependency-policy" title="Dependency policy" level={3}>
      <ul>
              <li>Match the <C>react-native</C> and <C>react-native-macos</C> minor versions exactly.</li>
              <li>Prefer libraries that explicitly advertise macOS and Windows support, or keep their host-specific use behind a narrow adapter.</li>
              <li>Wrap platform dependencies behind interfaces in <C>packages/platform-sdk</C>.</li>
              <li>Use <C>.macos.tsx</C> and <C>.windows.tsx</C> for native divergence, not runtime forests of <C>Platform.OS</C> conditions.</li>
              <li>Keep the desktop navigators independent from Expo Router until both host compatibility spikes are proven.</li>
            </ul>
      </Section>
      </Section>
      <Section id="server-and-database-work" title="Server and database work">
      <P>Add or formalize:</P>
      <Table
              head={[<>Area</>, <>Change</>]}
              rows={[
                [<>Devices</>, <><C>devices</C> table: id, user, host, name, public key, capabilities, last_seen, push token</>],
                [<>Handoff</>, <><C>drafts</C> and <C>continuation_activity</C> with optimistic version fields</>],
                [<>Connections</>, <>host device id, connection class, bridge version, health, last sync, auth expiry</>],
                [<>Search</>, <>unified endpoint returning cited messages, people, files, and loops</>],
                [<>Presence</>, <>ephemeral device/bridge health through Redis + Realtime</>],
                [<>Permissions</>, <>no raw TCC data; store only capability status and timestamps</>],
              ]}
            />
      <P>Suggested endpoints:</P>
      <Code lang="text">{"GET    /api/desktop/bootstrap\nPOST   /api/devices/enroll\nPOST   /api/devices/:id/approve\nDELETE /api/devices/:id\nGET    /api/connections/definitions\nGET    /api/connections\nPOST   /api/connections/:platform/start\nPOST   /api/connections/:id/complete\nPOST   /api/connections/:id/heartbeat\nGET    /api/connections/:id/diagnostics\nGET    /api/search?q=&scope=&cursor=\nGET    /api/drafts\nPUT    /api/drafts/:conversationId\nPOST   /api/handoff/:activityId/claim"}</Code>
      <P>All endpoints require user authentication and device identity. Diagnostics must return structured codes, not raw bridge logs.</P>
      </Section>
      <Section id="keyboard-pointer-and-accessibility-requirements" title="Keyboard, pointer, and accessibility requirements">
      <ul>
              <li>Full keyboard traversal with a visible <C>#3C68FF</C> focus ring.</li>
              <li>macOS: <C>⌘K</C> search, <C>⌘N</C> compose, <C>⌘,</C> settings, <C>⌘1–4</C> destinations, and <C>⌘⇧M</C> compact mode.</li>
              <li>Windows: <C>Ctrl+K</C> search, <C>Ctrl+N</C> compose, <C>Ctrl+,</C> settings, <C>Ctrl+1–4</C> destinations, and <C>Ctrl+Shift+M</C> compact mode.</li>
              <li>Context menus for conversations, messages, files, and loops.</li>
              <li>Multi-select and bulk actions in inbox/search where platform capabilities allow them.</li>
              <li>Minimum pointer target: 28 points; preferred primary control: 32–36 points.</li>
              <li>Support system text scaling without truncating message content.</li>
              <li>VoiceOver labels may include platform only after the person/message label.</li>
              <li>Never rely on platform color alone for identity or bridge health.</li>
              <li>Respect Reduce Motion, Increase Contrast, and Reduce Transparency.</li>
            </ul>
      </Section>
      <Section id="security-requirements" title="Security requirements">
      <ul>
              <li>Store tokens and local bridge secrets in Keychain (macOS) or Credential Locker/DPAPI (Windows), never JavaScript persistence.</li>
              <li>Use authenticated XPC on macOS and an authenticated named-pipe or equivalent OS IPC channel on Windows. A random per-install bearer token is acceptable only for a loopback endpoint with strict origin rejection.</li>
              <li>Bind any loopback APIs to <C>127.0.0.1</C> only and reject browser origins by default.</li>
              <li>Sign and verify bridge/helper updates.</li>
              <li>Sanitize exported diagnostics and require user review before upload.</li>
              <li>Do not include message content, cookies, phone numbers, or tokens in analytics.</li>
              <li>Show whether every connection is cloud, desktop-authenticated, or on-device.</li>
              <li>Provide “disconnect and delete local session” separately from “remove Matrix history.”</li>
            </ul>
      </Section>
      <Section id="delivery-plan" title="Delivery plan">
      <Section id="phase-0-compatibility-and-entitlements-spikes-1-2-weeks" title="Phase 0 — Compatibility and entitlements spikes (1–2 weeks)" level={3}>
      <ul>
              <li>Supported RN macOS and RN Windows apps launch and render identical shared tokens.</li>
              <li>Swift/Keychain and C++/WinRT/Credential Locker native-event proofs.</li>
              <li>macOS TCC permission detection proof.</li>
              <li>Device-pairing protocol proof with one revocable desktop device.</li>
              <li>Decision record for host version pairs, shared-package compatibility, navigation, Expo modules, distribution, and update strategy.</li>
            </ul>
      </Section>
      <Section id="phase-1-desktop-shells-1-2-weeks" title="Phase 1 — Desktop shells (1–2 weeks)" level={3}>
      <ul>
              <li>macOS and Windows window/menu commands, navigation rail, resizable panes.</li>
              <li>Auth, server bootstrap, theme primitives.</li>
              <li>Inbox and chat read-only data.</li>
            </ul>
      </Section>
      <Section id="phase-2-full-client-loop-2-3-weeks" title="Phase 2 — Full client loop (2–3 weeks)" level={3}>
      <ul>
              <li>Compose/send, attachments, reactions according to platform capability.</li>
              <li>Global search, loops, people, relationship memory.</li>
              <li>Desktop notifications, drafts, keyboard shortcuts.</li>
            </ul>
      </Section>
      <Section id="phase-3-companion-features-1-2-weeks" title="Phase 3 — Companion features (1–2 weeks)" level={3}>
      <ul>
              <li>Device registry, pairing approval, draft handoff, continuation activity.</li>
              <li>Compact chat and bridge-health home modules.</li>
            </ul>
      </Section>
      <Section id="phase-4-connections-2-4-weeks" title="Phase 4 — Connections (2–4 weeks)" level={3}>
      <ul>
              <li>Cloud bridge setup parity for WhatsApp and Telegram.</li>
              <li>Secure Instagram desktop authentication.</li>
              <li>Capability-driven connection registry and recovery UI.</li>
            </ul>
      </Section>
      <Section id="phase-5-imessage-local-bridge-3-5-weeks" title="Phase 5 — iMessage local bridge (3–5 weeks)" level={3}>
      <ul>
              <li>Signed bridge bundle, supervisor, permissions, wsproxy/appservice connection.</li>
              <li>Restart/update/diagnostics flows.</li>
              <li>Send, receive, backfill, contacts, and failure recovery.</li>
            </ul>
      </Section>
      <Section id="phase-6-hardening-and-distribution-2-weeks" title="Phase 6 — hardening and distribution (2 weeks)" level={3}>
      <ul>
              <li>Accessibility, performance, crash recovery, migration, signing/notarization.</li>
              <li>Release update channel and rollback.</li>
            </ul>
      <P>The functionality branch should treat phase estimates as sequencing guides, not commitments, until Phase 0 resolves version and entitlement risk.</P>
      </Section>
      </Section>
      <Section id="acceptance-criteria" title="Acceptance criteria">
      <Section id="full-client" title="Full client" level={3}>
      <ul>
              <li>A user can use Claire Desktop on macOS or Windows from sign-in through sending a message without mobile.</li>
              <li>Inbox updates arrive within two seconds of server receipt under normal conditions.</li>
              <li>Search returns source-backed results across all connected platforms.</li>
              <li>Pane widths, selected conversation, drafts, and window position restore after restart.</li>
              <li>Every platform action is gated by declared capability.</li>
            </ul>
      </Section>
      <Section id="companion" title="Companion" level={3}>
      <ul>
              <li>Desktop can claim and continue a mobile draft without overwriting a newer version.</li>
              <li>The mobile app can see whether a Mac-only bridge is online.</li>
              <li>A local bridge outage produces an actionable state, not silent missing messages.</li>
              <li>Compact chat opens/closes from a shortcut and retains the active conversation.</li>
            </ul>
      </Section>
      <Section id="host-specific-capability-behavior" title="Host-specific capability behavior" level={3}>
      <ul>
              <li>macOS can host iMessage after every required local permission is granted.</li>
              <li>{"Windows never advertises iMessage setup as locally available, but it can use a connected iMessage account hosted by the user's paired Mac."}</li>
              <li>Instagram setup appears only when the desktop authentication proof has passed for that host; otherwise the app shows an honest unavailable state.</li>
            </ul>
      </Section>
      <Section id="imessage-2" title="iMessage" level={3}>
      <ul>
              <li>Permission state is verified independently for each required macOS capability.</li>
              <li>The bridge restarts after user login only when the user opted in.</li>
              <li>No raw message database path, token, or message content appears in diagnostics.</li>
              <li>Removing the connection stops the helper and deletes local bridge credentials.</li>
            </ul>
      </Section>
      </Section>
      <Section id="test-strategy" title="Test strategy">
      <ul>
              <li>Unit: reducers/stores, capability decisions, bridge-state normalization, search result mapping.</li>
              <li>Component: all pane breakpoints, focus order, context menus, error states.</li>
              <li>Contract: server schemas shared between desktop and server.</li>
              <li>Integration: mock Matrix sync, auth expiry, send retry, draft conflict.</li>
              <li>Native integration: Keychain, notifications, TCC status, process supervisor.</li>
              <li>End-to-end: sign in → connect network → sync → search → send → handoff.</li>
              <li>Soak: 100k messages, 5k rooms, 24-hour sync, Mac sleep/wake, network change.</li>
            </ul>
      </Section>
      <Section id="risks-and-mitigations" title="Risks and mitigations">
      <Table
              head={[<>Risk</>, <>Mitigation</>]}
              rows={[
                [<>RN macOS and RN Windows track different RN minors</>, <>Separate native hosts; compatibility ADR; share source packages only</>],
                [<>Expo modules are experimental</>, <>Avoid them in desktop MVP; prove modules individually</>],
                [<>iMessage permissions/distribution</>, <>Phase 0 entitlement spike; Developer ID distribution</>],
                [<>Local bridge offline</>, <>Health heartbeat, explicit host status, mobile warning</>],
                [<>Instagram session expiry</>, <>Structured re-auth flow and expiry status</>],
                [<>Feature mismatch across networks</>, <>Capability registry controls UI and actions</>],
                [<>Four-pane performance</>, <>Virtualized lists, memoized rows, incremental search, bounded inspectors</>],
                [<>Security of local helper</>, <>Signed binary, Keychain, authenticated XPC/loopback, redacted logs</>],
              ]}
            />
      </Section>
    </Doc>
  );
}
