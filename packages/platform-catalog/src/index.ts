export type PlatformSupportStatus = 'available' | 'beta' | 'planned' | 'unavailable';
export type PlatformSetupSurface = 'phone' | 'desktop' | 'mac';
export type PlatformRuntimeHost = 'cloud' | 'self_hosted' | 'paired_device';
export type PlatformDeviceDependency =
  | 'pairing_only'
  | 'none'
  | 'always_on_mac'
  | 'android_phone_online';
export type PlatformIconTreatment = 'knockout' | 'original' | 'generic';

export interface PlatformDefinition {
  id: string;
  name: string;
  mark: string;
  accent: string;
  iconUrl: string;
  iconSourceUrl: string;
  iconTreatment: PlatformIconTreatment;
  bridge: string;
  docsUrl: string;
  supportStatus: PlatformSupportStatus;
  deliveryWave: 'current' | 'wave_1' | 'wave_2' | 'wave_3' | 'parallel_mac';
  setupSurface: PlatformSetupSurface;
  setupLabel: string;
  runtimeHost: PlatformRuntimeHost;
  runtimeLabel: string;
  deviceDependency: PlatformDeviceDependency;
  authSummary: string;
  detail: string;
  capabilities: {
    cloudRuntime: boolean;
    selfHostedRuntime: boolean;
    desktopSetup: boolean;
    persistentDevice: boolean;
  };
}

const MAUTRIX_DOCS = 'https://docs.mau.fi/bridges';

/**
 * Public connector catalog shared by the API and the generated landing page.
 * A platform being documented by mautrix does not make it available in Claire:
 * supportStatus is the product truth shown to users.
 */
export const platformCatalog: readonly PlatformDefinition[] = [
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    mark: 'WA',
    accent: '#25d366',
    iconUrl: 'https://cdn.simpleicons.org/whatsapp/ffffff',
    iconSourceUrl: 'https://simpleicons.org/?q=whatsapp',
    iconTreatment: 'knockout',
    bridge: 'mautrix-whatsapp',
    docsUrl: `${MAUTRIX_DOCS}/go/whatsapp/`,
    supportStatus: 'available',
    deliveryWave: 'current',
    setupSurface: 'phone',
    setupLabel: 'Pair from your phone',
    runtimeHost: 'cloud',
    runtimeLabel: 'Cloud or self-hosted',
    deviceDependency: 'pairing_only',
    authSummary: 'Scan a QR code or enter a pairing code from WhatsApp Linked Devices.',
    detail:
      'After pairing, Claire keeps the bridge online. Your phone only needs to reconnect periodically to keep the linked session valid.',
    capabilities: {
      cloudRuntime: true,
      selfHostedRuntime: true,
      desktopSetup: false,
      persistentDevice: false,
    },
  },
  {
    id: 'telegram',
    name: 'Telegram',
    mark: 'TG',
    accent: '#229ed9',
    iconUrl: 'https://cdn.simpleicons.org/telegram/ffffff',
    iconSourceUrl: 'https://simpleicons.org/?q=telegram',
    iconTreatment: 'knockout',
    bridge: 'mautrix-telegram',
    docsUrl: `${MAUTRIX_DOCS}/go/telegram/`,
    supportStatus: 'available',
    deliveryWave: 'current',
    setupSurface: 'phone',
    setupLabel: 'Approve from your phone',
    runtimeHost: 'cloud',
    runtimeLabel: 'Cloud or self-hosted',
    deviceDependency: 'pairing_only',
    authSummary: 'Approve a QR login or enter the code sent to an existing Telegram client.',
    detail:
      'Once approved, the bridge runs independently on your selected Claire host; the desktop app does not need to stay open.',
    capabilities: {
      cloudRuntime: true,
      selfHostedRuntime: true,
      desktopSetup: false,
      persistentDevice: false,
    },
  },
  {
    id: 'instagram',
    name: 'Instagram',
    mark: 'IG',
    accent: '#d62976',
    iconUrl: 'https://cdn.simpleicons.org/instagram/ffffff',
    iconSourceUrl: 'https://simpleicons.org/?q=instagram',
    iconTreatment: 'knockout',
    bridge: 'mautrix-meta (Instagram mode)',
    docsUrl: `${MAUTRIX_DOCS}/go/meta/`,
    supportStatus: 'available',
    deliveryWave: 'current',
    setupSurface: 'desktop',
    setupLabel: 'Claire Desktop setup',
    runtimeHost: 'cloud',
    runtimeLabel: 'Desktop may close after setup',
    deviceDependency: 'none',
    authSummary:
      'Authorize Instagram in Claire Desktop so session material can pass directly to the bridge.',
    detail:
      'The desktop companion is used for secure sign-in. After the handoff succeeds, a cloud-hosted bridge can continue syncing while the computer is closed.',
    capabilities: {
      cloudRuntime: true,
      selfHostedRuntime: true,
      desktopSetup: true,
      persistentDevice: false,
    },
  },
  {
    id: 'messenger',
    name: 'Messenger',
    mark: 'MS',
    accent: '#0866ff',
    iconUrl: 'https://cdn.simpleicons.org/messenger/ffffff',
    iconSourceUrl: 'https://simpleicons.org/?q=messenger',
    iconTreatment: 'knockout',
    bridge: 'mautrix-meta (Messenger mode)',
    docsUrl: `${MAUTRIX_DOCS}/go/meta/`,
    supportStatus: 'planned',
    deliveryWave: 'wave_1',
    setupSurface: 'desktop',
    setupLabel: 'Claire Desktop setup',
    runtimeHost: 'cloud',
    runtimeLabel: 'Desktop may close after setup',
    deviceDependency: 'none',
    authSummary: 'Authorize Messenger in a contained Claire Desktop sign-in window.',
    detail:
      'Messenger will use a separate, independently revocable Meta bridge session even when Instagram is connected too.',
    capabilities: {
      cloudRuntime: true,
      selfHostedRuntime: true,
      desktopSetup: true,
      persistentDevice: false,
    },
  },
  {
    id: 'signal',
    name: 'Signal',
    mark: 'SI',
    accent: '#3a76f0',
    iconUrl: 'https://cdn.simpleicons.org/signal/ffffff',
    iconSourceUrl: 'https://simpleicons.org/?q=signal',
    iconTreatment: 'knockout',
    bridge: 'mautrix-signal',
    docsUrl: `${MAUTRIX_DOCS}/go/signal/`,
    supportStatus: 'planned',
    deliveryWave: 'wave_1',
    setupSurface: 'phone',
    setupLabel: 'Link from your phone',
    runtimeHost: 'cloud',
    runtimeLabel: 'Cloud or self-hosted',
    deviceDependency: 'pairing_only',
    authSummary: 'Scan a linked-device QR code from the Signal mobile app.',
    detail:
      'Claire appears as a linked Signal device. The bridge can remain online without Claire Desktop after linking.',
    capabilities: {
      cloudRuntime: true,
      selfHostedRuntime: true,
      desktopSetup: false,
      persistentDevice: false,
    },
  },
  {
    id: 'discord',
    name: 'Discord',
    mark: 'DC',
    accent: '#5865f2',
    iconUrl: 'https://cdn.simpleicons.org/discord/ffffff',
    iconSourceUrl: 'https://simpleicons.org/?q=discord',
    iconTreatment: 'knockout',
    bridge: 'mautrix-discord',
    docsUrl: `${MAUTRIX_DOCS}/go/discord/`,
    supportStatus: 'planned',
    deliveryWave: 'wave_1',
    setupSurface: 'phone',
    setupLabel: 'Approve by QR',
    runtimeHost: 'cloud',
    runtimeLabel: 'Cloud or self-hosted',
    deviceDependency: 'pairing_only',
    authSummary: 'Use Discord mobile to scan and approve the bridge login.',
    detail:
      'QR approval is the primary Claire flow. Manual user-token extraction will not be presented as a normal product setup path.',
    capabilities: {
      cloudRuntime: true,
      selfHostedRuntime: true,
      desktopSetup: false,
      persistentDevice: false,
    },
  },
  {
    id: 'imessage',
    name: 'iMessage',
    mark: 'IM',
    accent: '#34c759',
    iconUrl: 'https://cdn.simpleicons.org/imessage/ffffff',
    iconSourceUrl: 'https://simpleicons.org/?q=imessage',
    iconTreatment: 'knockout',
    bridge: 'mautrix-imessage',
    docsUrl: `${MAUTRIX_DOCS}/go/imessage/`,
    supportStatus: 'beta',
    deliveryWave: 'parallel_mac',
    setupSurface: 'mac',
    setupLabel: 'Set up on this Mac',
    runtimeHost: 'paired_device',
    runtimeLabel: 'Mac must remain available',
    deviceDependency: 'always_on_mac',
    authSummary:
      'Grant Claire Desktop access to Messages, Contacts, and the required macOS automation permissions.',
    detail:
      'The local Mac helper reads and sends through Apple Messages. If the host Mac sleeps or goes offline, iMessage pauses and resumes when it returns.',
    capabilities: {
      cloudRuntime: false,
      selfHostedRuntime: true,
      desktopSetup: true,
      persistentDevice: true,
    },
  },
  {
    id: 'google-messages',
    name: 'Google Messages',
    mark: 'GM',
    accent: '#1a73e8',
    iconUrl: 'https://api.iconify.design/thesvg-color/google-messages.svg',
    iconSourceUrl: 'https://icon-sets.iconify.design/thesvg-color/google-messages/',
    iconTreatment: 'original',
    bridge: 'mautrix-gmessages',
    docsUrl: `${MAUTRIX_DOCS}/go/gmessages/`,
    supportStatus: 'planned',
    deliveryWave: 'wave_2',
    setupSurface: 'desktop',
    setupLabel: 'Desktop + phone approval',
    runtimeHost: 'cloud',
    runtimeLabel: 'Android phone stays online',
    deviceDependency: 'android_phone_online',
    authSummary:
      'Sign in on Claire Desktop, then approve the connection from Google Messages on Android.',
    detail:
      'Claire Desktop may close after setup, but the paired Android phone remains part of message delivery and must stay connected.',
    capabilities: {
      cloudRuntime: true,
      selfHostedRuntime: true,
      desktopSetup: true,
      persistentDevice: true,
    },
  },
  {
    id: 'google-chat',
    name: 'Google Chat',
    mark: 'GC',
    accent: '#00ac47',
    iconUrl: 'https://api.iconify.design/thesvg-color/google-chat-2026.svg',
    iconSourceUrl: 'https://icon-sets.iconify.design/thesvg-color/google-chat-2026/',
    iconTreatment: 'original',
    bridge: 'mautrix-googlechat',
    docsUrl: `${MAUTRIX_DOCS}/python/googlechat/`,
    supportStatus: 'planned',
    deliveryWave: 'wave_2',
    setupSurface: 'desktop',
    setupLabel: 'Claire Desktop setup',
    runtimeHost: 'cloud',
    runtimeLabel: 'Desktop may close after setup',
    deviceDependency: 'none',
    authSummary: 'Authorize Google Chat through a contained desktop session.',
    detail:
      'The current bridge uses a legacy authentication driver, which Claire will isolate behind the same connection contract as BridgeV2 networks.',
    capabilities: {
      cloudRuntime: true,
      selfHostedRuntime: true,
      desktopSetup: true,
      persistentDevice: false,
    },
  },
  {
    id: 'google-voice',
    name: 'Google Voice',
    mark: 'GV',
    accent: '#34a853',
    iconUrl: 'https://api.iconify.design/thesvg-color/google-voice-2026.svg',
    iconSourceUrl: 'https://icon-sets.iconify.design/thesvg-color/google-voice-2026/',
    iconTreatment: 'original',
    bridge: 'mautrix-gvoice',
    docsUrl: `${MAUTRIX_DOCS}/go/gvoice/`,
    supportStatus: 'planned',
    deliveryWave: 'wave_2',
    setupSurface: 'desktop',
    setupLabel: 'Claire Desktop setup',
    runtimeHost: 'cloud',
    runtimeLabel: 'Desktop may close after setup',
    deviceDependency: 'none',
    authSummary: 'Authorize Google Voice with a desktop browser session managed by Claire.',
    detail:
      'Authentication material goes directly to the selected bridge host; users will not be asked to copy cookies or terminal commands.',
    capabilities: {
      cloudRuntime: true,
      selfHostedRuntime: true,
      desktopSetup: true,
      persistentDevice: false,
    },
  },
  {
    id: 'slack',
    name: 'Slack',
    mark: 'SL',
    accent: '#611f69',
    iconUrl: 'https://api.iconify.design/logos/slack-icon.svg',
    iconSourceUrl: 'https://icon-sets.iconify.design/logos/slack-icon/',
    iconTreatment: 'original',
    bridge: 'mautrix-slack',
    docsUrl: `${MAUTRIX_DOCS}/go/slack/`,
    supportStatus: 'planned',
    deliveryWave: 'wave_2',
    setupSurface: 'desktop',
    setupLabel: 'Claire Desktop setup',
    runtimeHost: 'cloud',
    runtimeLabel: 'Desktop may close after setup',
    deviceDependency: 'none',
    authSummary: 'Choose a workspace and complete the secure desktop authorization flow.',
    detail:
      'Each workspace is represented as a separate connection with independent health, permissions, and revocation.',
    capabilities: {
      cloudRuntime: true,
      selfHostedRuntime: true,
      desktopSetup: true,
      persistentDevice: false,
    },
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    mark: 'IN',
    accent: '#0a66c2',
    iconUrl: 'https://api.iconify.design/logos/linkedin-icon.svg',
    iconSourceUrl: 'https://icon-sets.iconify.design/logos/linkedin-icon/',
    iconTreatment: 'original',
    bridge: 'mautrix-linkedin',
    docsUrl: `${MAUTRIX_DOCS}/go/linkedin/`,
    supportStatus: 'planned',
    deliveryWave: 'wave_2',
    setupSurface: 'desktop',
    setupLabel: 'Claire Desktop setup',
    runtimeHost: 'cloud',
    runtimeLabel: 'Desktop may close after setup',
    deviceDependency: 'none',
    authSummary:
      'Sign in through Claire Desktop using the browser identity expected by the bridge.',
    detail:
      'Claire will monitor session expiry and ask for reauthorization without exposing session cookies to the application UI.',
    capabilities: {
      cloudRuntime: true,
      selfHostedRuntime: true,
      desktopSetup: true,
      persistentDevice: false,
    },
  },
  {
    id: 'x',
    name: 'X',
    mark: 'X',
    accent: '#111111',
    iconUrl: 'https://cdn.simpleicons.org/x/ffffff',
    iconSourceUrl: 'https://simpleicons.org/?q=x',
    iconTreatment: 'knockout',
    bridge: 'mautrix-twitter',
    docsUrl: `${MAUTRIX_DOCS}/go/twitter/`,
    supportStatus: 'planned',
    deliveryWave: 'wave_2',
    setupSurface: 'desktop',
    setupLabel: 'Claire Desktop setup',
    runtimeHost: 'cloud',
    runtimeLabel: 'Desktop may close after setup',
    deviceDependency: 'none',
    authSummary:
      'Authorize X in a contained desktop session and hand the resulting session directly to the bridge.',
    detail:
      'Direct messages sync through the bridge after setup. Reauthentication appears as an actionable connection state.',
    capabilities: {
      cloudRuntime: true,
      selfHostedRuntime: true,
      desktopSetup: true,
      persistentDevice: false,
    },
  },
  {
    id: 'bluesky',
    name: 'Bluesky',
    mark: 'BS',
    accent: '#1185fe',
    iconUrl: 'https://cdn.simpleicons.org/bluesky/ffffff',
    iconSourceUrl: 'https://simpleicons.org/?q=bluesky',
    iconTreatment: 'knockout',
    bridge: 'mautrix-bluesky',
    docsUrl: `${MAUTRIX_DOCS}/go/bluesky/`,
    supportStatus: 'planned',
    deliveryWave: 'wave_3',
    setupSurface: 'phone',
    setupLabel: 'App password',
    runtimeHost: 'cloud',
    runtimeLabel: 'Cloud or self-hosted',
    deviceDependency: 'none',
    authSummary: 'Enter your handle, PDS, and an app-specific password.',
    detail:
      'No desktop companion is required. Claire stores the bridge credential according to the selected hosting mode.',
    capabilities: {
      cloudRuntime: true,
      selfHostedRuntime: true,
      desktopSetup: false,
      persistentDevice: false,
    },
  },
  {
    id: 'zulip',
    name: 'Zulip',
    mark: 'ZU',
    accent: '#6492fe',
    iconUrl: 'https://cdn.simpleicons.org/zulip/ffffff',
    iconSourceUrl: 'https://simpleicons.org/?q=zulip',
    iconTreatment: 'knockout',
    bridge: 'mautrix-zulip',
    docsUrl: `${MAUTRIX_DOCS}/go/zulip/`,
    supportStatus: 'planned',
    deliveryWave: 'wave_3',
    setupSurface: 'phone',
    setupLabel: 'Workspace API key',
    runtimeHost: 'cloud',
    runtimeLabel: 'Cloud or self-hosted',
    deviceDependency: 'none',
    authSummary: 'Enter the workspace URL, account email, and a revocable Zulip API key.',
    detail:
      'The connection runs on the selected bridge host and does not require Claire Desktop to remain open.',
    capabilities: {
      cloudRuntime: true,
      selfHostedRuntime: true,
      desktopSetup: false,
      persistentDevice: false,
    },
  },
  {
    id: 'irc',
    name: 'IRC',
    mark: 'IRC',
    accent: '#6b5b95',
    iconUrl: 'https://api.iconify.design/fa6-solid/hashtag.svg?color=%23ffffff',
    iconSourceUrl: 'https://icon-sets.iconify.design/fa6-solid/hashtag/',
    iconTreatment: 'generic',
    bridge: 'mautrix-irc',
    docsUrl: `${MAUTRIX_DOCS}/go/irc/`,
    supportStatus: 'planned',
    deliveryWave: 'wave_3',
    setupSurface: 'phone',
    setupLabel: 'Network credentials',
    runtimeHost: 'cloud',
    runtimeLabel: 'Cloud or self-hosted',
    deviceDependency: 'none',
    authSummary: 'Choose a configured IRC network and optionally provide SASL credentials.',
    detail:
      'Claire keeps the IRC connection alive on the selected host and surfaces reconnect state when a network drops.',
    capabilities: {
      cloudRuntime: true,
      selfHostedRuntime: true,
      desktopSetup: false,
      persistentDevice: false,
    },
  },
] as const;

export const platformCatalogVersion = 2;

export {
  DEFAULT_LOOP_SEMANTICS,
  loopSemanticsFor,
  hasBroadcastMention,
  type LoopSemantics,
  type MentionStyle,
  type ThreadingModel,
  type GroupModel,
  type LoopSensitivity,
} from './loop-semantics';
