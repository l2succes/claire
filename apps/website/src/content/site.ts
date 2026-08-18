// SPDX-License-Identifier: Apache-2.0
export const primaryNavigation = [
  { href: '/#product', label: 'Product' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/security', label: 'Security' },
  { href: '/developers', label: 'Developers' },
] as const;

export const moreLinks = [
  { href: '/business', title: 'Business', body: 'A shared inbox for customer teams.' },
  {
    href: '/campaigns/close-the-loop',
    title: 'Campaign',
    body: 'Watch the Close your loops creative concept.',
  },
  { href: '/docs', title: 'Docs', body: 'Set up the repo and run Claire yourself.' },
  { href: '/#open-source', title: 'Open source', body: 'Licenses, GitHub, and self-hosting.' },
  { href: '/faq', title: 'FAQ', body: 'Product, hosting, and contributor questions.' },
] as const;

export const downloadOptions = [
  { id: 'macos', name: 'Mac', href: '/#start', available: true },
  { id: 'ios', name: 'iOS', href: '/#start', available: true },
  { id: 'windows', name: 'Windows', href: null, available: false },
  { id: 'android', name: 'Android', href: null, available: false },
] as const;

export const footerLinks = [
  { href: 'https://github.com/l2succes/claire', label: 'GitHub' },
  { href: '/docs', label: 'Docs' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/security', label: 'Security' },
  { href: '/business', label: 'Business' },
  { href: '/developers', label: 'Developers' },
  { href: '/faq', label: 'FAQ' },
  { href: '/mockups/mobile', label: 'Mobile' },
  { href: '/mockups/desktop', label: 'Desktop' },
  { href: '/campaigns/close-the-loop', label: 'Campaign' },
  { href: '/legal/privacy', label: 'Privacy' },
  { href: '/legal/terms', label: 'Terms' },
] as const;

export const faqGroups = [
  {
    title: 'Product',
    items: [
      [
        'What is Claire?',
        'Claire is a multi-network messaging client with an AI layer for search, replies, memory, promises, and permissioned actions.',
      ],
      [
        'Which networks work today?',
        'WhatsApp, Telegram, and Instagram are the current product baseline. The broader catalog is a roadmap, not a claim of current availability.',
      ],
      [
        'Does Claire replace the original apps?',
        'It can become your primary client for supported workflows, while some setup, recovery, or network-specific features still require the original app or paired device.',
      ],
    ],
  },
  {
    title: 'Hosting and AI',
    items: [
      [
        'Can I self-host Claire?',
        'Yes. Run the application stack on infrastructure you control. Start with mock mode, then add Docker services when you need live bridges.',
      ],
      [
        'Can I use my own AI provider?',
        'The architecture supports bring-your-own-key providers and compatible local runtimes. Generation and embeddings are configured separately.',
      ],
      [
        'Does Claire store nothing in the cloud?',
        'No blanket guarantee is made today. Claire Cloud stores normalized message data, and configured external AI providers may receive selected content. A verified desktop-only mode is planned.',
      ],
    ],
  },
  {
    title: 'Developers',
    items: [
      [
        'Can I build a Claire plugin?',
        'Yes. Use `bun run plugin:create` and the local calendar/task examples. Plugins use typed triggers, actions, permissions, and fixtures.',
      ],
      [
        'Where should I start?',
        'Clone the repository, run `bun run setup`, then `bun run dev`. Read the repository setup guide and pick a contribution track.',
      ],
      [
        'How do I ask the docs a question?',
        'Use search on /docs, or POST /api/docs/ask when an OpenAI key is configured. If AI is disabled, search remains available.',
      ],
    ],
  },
] as const;
