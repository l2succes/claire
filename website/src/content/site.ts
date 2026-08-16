import type { ComponentType, SVGProps } from 'react';
import {
  BoltIcon,
  BuildingOffice2Icon,
  ChatBubbleLeftRightIcon,
  CloudIcon,
  CodeBracketSquareIcon,
  CubeTransparentIcon,
  DevicePhoneMobileIcon,
  LockClosedIcon,
  PuzzlePieceIcon,
  ServerStackIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';

export type IconType = ComponentType<SVGProps<SVGSVGElement>>;

export const primaryNavigation = [
  { href: '/connections', label: 'Connections' },
  { href: '/plugins', label: 'Plugins' },
  { href: '/business', label: 'Business' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/developers', label: 'Developers' },
];

export const footerGroups = [
  { title: 'Product', links: [['Connections', '/connections'], ['Plugins', '/plugins'], ['Download', '/download'], ['Self-hosting', '/self-hosting']] },
  { title: 'Developers', links: [['Docs', '/developers'], ['Components', '/developers/components'], ['Mobile reference', '/developers/mobile'], ['Desktop reference', '/developers/desktop']] },
  { title: 'Company', links: [['About', '/about'], ['FAQ', '/faq'], ['Changelog', '/changelog'], ['Contact', '/contact']] },
  { title: 'Trust', links: [['Security', '/security'], ['Privacy', '/legal/privacy'], ['Terms', '/legal/terms']] },
] as const;

export const homeFeatures: { icon: IconType; title: string; body: string }[] = [
  { icon: ChatBubbleLeftRightIcon, title: 'Every conversation, together', body: 'Read and reply across messaging networks without losing the source, context, or relationship.' },
  { icon: SparklesIcon, title: 'One AI across every chat', body: 'Ask questions, draft replies, track promises, and act on conversations with evidence from the original messages.' },
  { icon: PuzzlePieceIcon, title: 'Actions through plugins', body: 'Turn a message into a calendar event, CRM update, task, or custom workflow—with approval where it matters.' },
];

export const pages = {
  about: {
    eyebrow: 'ABOUT CLAIRE', title: 'Messaging should help you remember, respond, and follow through.',
    intro: 'Claire is building a unified, AI-native messaging client that treats conversations as the beginning of useful work—not another stream to manage.',
    cards: [
      ['The problem', 'Important context is scattered across personal, professional, and community inboxes. Search stops at network boundaries and follow-through depends on memory.'],
      ['Our approach', 'Preserve the original conversation, add a user-controlled intelligence layer, and let people choose managed cloud or infrastructure they operate.'],
      ['The principle', 'AI should remain inspectable. Suggestions cite their source, consequential actions ask for permission, and planned privacy modes are never marketed as finished.'],
    ],
  },
  connections: {
    eyebrow: 'CONNECTIONS', title: 'One inbox, without pretending every network works the same.',
    intro: 'Claire uses Matrix and mautrix bridges to connect messaging networks while clearly showing setup, hosting, and device requirements.',
    cards: [
      ['Available now', 'WhatsApp, Telegram, and Instagram form the current product baseline.'],
      ['Desktop-assisted', 'Some networks require a secure desktop authorization once; the bridge can continue in Claire Cloud or your own stack afterward.'],
      ['Device-dependent', 'iMessage requires a Mac host, while Google Messages depends on its paired Android phone. Claire makes those dependencies visible.'],
    ],
  },
  plugins: {
    eyebrow: 'CLAIRE PLUGINS', title: 'Let conversations become useful actions.',
    intro: 'A permissioned plugin system can turn intent inside a chat into calendar events, CRM records, tasks, reminders, and workflows.',
    cards: [
      ['Discover', 'Browse verified integrations by outcome, provider, permission level, and hosting compatibility.'],
      ['Review', 'Claire previews the data and action before a plugin crosses an external boundary.'],
      ['Build', 'Developers use typed triggers, actions, scopes, test fixtures, and a local sandbox to extend Claire safely.'],
    ],
  },
  business: {
    eyebrow: 'CLAIRE FOR BUSINESS', title: 'Manage, automate, and improve every customer conversation.',
    intro: 'A shared conversation workspace for teams operating across Instagram, LinkedIn, SMS, WhatsApp, and other customer channels.',
    cards: [
      ['Shared inbox', 'Route, assign, label, and resolve conversations with ownership and service-level visibility.'],
      ['Safe automation', 'Qualify leads, answer common questions, schedule follow-ups, and escalate with human approval rules.'],
      ['Relationship intelligence', 'Give teams durable context, consistent voice guidance, and outcomes across every customer thread.'],
    ],
  },
  pricing: {
    eyebrow: 'PRICING', title: 'Run it yourself, or pay Claire to keep it running.',
    intro: 'The product model separates software access, managed infrastructure, and AI usage so teams can choose the operating model that fits.',
    cards: [
      ['Community', 'Self-host Claire and bring your own model credentials or compatible local model.'],
      ['Claire Cloud', 'Managed bridges, storage, backups, monitoring, and an included AI allowance.'],
      ['Business', 'Shared inboxes, roles, automation, governance, support, and higher operational limits.'],
    ],
  },
  download: {
    eyebrow: 'GET CLAIRE', title: 'Choose the client—and the host—that fits.',
    intro: 'Use Claire on mobile and desktop, connect to Claire Cloud, or point the clients at a compatible self-hosted workspace.',
    cards: [['Mobile', 'A focused inbox, chat, Ask Claire, promises, search, and approvals on iOS and Android.'], ['Desktop', 'A full macOS client plus secure setup and local bridge capabilities for device-dependent networks.'], ['Web', 'A future browser workspace for cloud and self-hosted deployments where connection requirements allow it.']],
  },
  'self-hosting': {
    eyebrow: 'SELF-HOSTING', title: 'Your stack, your credentials, your operating boundary.',
    intro: 'Run Claire’s Bun server, Matrix, mautrix bridges, Supabase, and Redis through Docker on infrastructure you control.',
    cards: [['Deploy', 'Start from a documented Docker topology with explicit secrets, storage, and network boundaries.'], ['Bring your model', 'Use direct provider credentials or compatible local inference without mandatory AI gateway lock-in.'], ['Operate', 'Monitor bridge health, backups, migrations, reauthentication, and host availability as part of the product.']],
  },
  security: {
    eyebrow: 'SECURITY', title: 'Trust must follow the real data path.',
    intro: 'Claire documents where messages, credentials, embeddings, and AI requests travel—and avoids guarantees the production architecture cannot yet prove.',
    cards: [['Credentials', 'Desktop-assisted secrets pass directly to provisioning and belong in Keychain, credential managers, or encrypted secret stores.'], ['AI boundaries', 'Selected content may reach the configured provider. Claire never silently falls back from BYOK or local execution to managed AI.'], ['Private mode', 'Desktop-only privacy remains in development until egress auditing, offline indexing, and configuration enforcement prove the guarantee.']],
  },
  changelog: {
    eyebrow: 'CHANGELOG', title: 'A public record of what Claire can actually do.',
    intro: 'Product releases, connector availability, migrations, and meaningful design-system changes will be recorded here.',
    cards: [['Product releases', 'New user-facing workflows and client capabilities.'], ['Connector status', 'Authentication, sync, media, recovery, and availability milestones by network.'], ['Breaking changes', 'Migration notes for operators, plugin developers, and API consumers.']],
  },
  contact: {
    eyebrow: 'CONTACT', title: 'Build, operate, or partner with Claire.',
    intro: 'We want to hear from self-hosters, plugin developers, design contributors, businesses, and infrastructure partners.',
    cards: [['Community', 'Discuss product direction, propose plugins, and contribute implementation work.'], ['Business', 'Explore managed inboxes, automation, governance, and deployment needs.'], ['Security', 'Report sensitive issues privately with enough detail for reproducible triage.']],
  },
} as const;

export const developerTracks: { icon: IconType; title: string; body: string; href: string }[] = [
  { icon: CubeTransparentIcon, title: 'Component kit', body: 'Tokens, controls, navigation, cards, states, and composition rules used across the product.', href: '/developers/components' },
  { icon: DevicePhoneMobileIcon, title: 'Mobile reference', body: 'Screen architecture and high-fidelity patterns for the Expo client.', href: '/developers/mobile' },
  { icon: BuildingOffice2Icon, title: 'Desktop reference', body: 'macOS workspace, rails, details, connections, and companion flows.', href: '/developers/desktop' },
  { icon: PuzzlePieceIcon, title: 'Plugin reference', body: 'Marketplace, installation, permissions, actions, runs, and developer tooling.', href: '/developers/plugins' },
  { icon: CodeBracketSquareIcon, title: 'API and architecture', body: 'Matrix-backed messaging, platform definitions, AI providers, and hosting contracts.', href: '/developers/docs/getting-started' },
  { icon: LockClosedIcon, title: 'Trust model', body: 'Data boundaries, consent, credential rules, review policy, and threat-model expectations.', href: '/security' },
];

export const operatingModes = [
  { icon: CloudIcon, title: 'Claire Cloud', body: 'Managed infrastructure and optional included AI usage.' },
  { icon: ServerStackIcon, title: 'Self-hosted', body: 'Run the stack and model credentials on infrastructure you control.' },
  { icon: BoltIcon, title: 'Private desktop', body: 'A future audited local-only mode—not yet a production guarantee.' },
];
