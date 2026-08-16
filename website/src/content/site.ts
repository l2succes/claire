// SPDX-License-Identifier: Apache-2.0
export const primaryNavigation = [
  { href: '/#product', label: 'Product' },
  { href: '/#connections', label: 'Connections' },
  { href: '/security', label: 'Security' },
  { href: '/#pricing', label: 'Pricing' },
] as const;

export const exploreLinks = [
  { href: '/#start', title: 'Cloud or local', body: 'Choose how Claire fits your setup.' },
  { href: '/#stories', title: 'Stories', body: 'See the product in everyday conversation.' },
  { href: '/security', title: 'Security details', body: 'See the current data boundaries.' },
  { href: '/mockups/mobile', title: 'Mobile preview', body: 'Explore the app concept.' },
  { href: '/mockups/desktop', title: 'Desktop preview', body: 'Explore the desktop concept.' },
  { href: '/docs', title: 'Documentation', body: 'Set up the repo and contribute.' },
] as const;

export const footerLinks = [
  { href: 'https://github.com/l2succes/claire', label: 'GitHub' },
  { href: '/docs', label: 'Docs' },
  { href: '/security', label: 'Security' },
  { href: '/business', label: 'Business' },
  { href: '/developers', label: 'Developers' },
  { href: '/faq', label: 'FAQ' },
  { href: '/mockups/mobile', label: 'Mobile' },
  { href: '/mockups/desktop', label: 'Desktop' },
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
