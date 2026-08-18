// SPDX-License-Identifier: Apache-2.0
import type { HeroIconName } from '@/components/site/HeroIcon';
import type { MockupSurface } from '@/lib/docs-types';

/**
 * The curated part of the documentation home.
 *
 * Everything else on the site is derived from metadata, but "where should I
 * start?" is an editorial question — a generated list of 37 documents cannot
 * answer it. This is the one hand-maintained file, and it is deliberately
 * small: four routes in, and the catalog handles the rest.
 */
export type StartPath = {
  icon: HeroIconName;
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  steps: Array<{ label: string; href: string }>;
};

export const startPaths: StartPath[] = [
  {
    icon: 'sparkles',
    eyebrow: 'For contributors',
    title: 'Run Claire locally',
    description:
      'Clone the repository, start the stack in mock mode, and see the whole product without linking a messaging account.',
    href: '/docs/get-started/quickstart',
    steps: [
      { label: 'Repository setup', href: '/docs/get-started/quickstart' },
      { label: 'Environment variables', href: '/docs/get-started/environment' },
      { label: 'Mock bridge mode', href: '/docs/get-started/mock-mode' },
    ],
  },
  {
    icon: 'desktop',
    eyebrow: 'For engineers',
    title: 'Understand the architecture',
    description:
      'How clients, the Bun API, Supabase, Redis, Synapse, and the mautrix bridges fit together — and where to change what.',
    href: '/docs/build-claire/architecture',
    steps: [
      { label: 'Architecture overview', href: '/docs/build-claire/architecture' },
      { label: 'Mobile app', href: '/docs/build-claire/mobile' },
      { label: 'Desktop app', href: '/docs/build-claire/desktop' },
    ],
  },
  {
    icon: 'server',
    eyebrow: 'For operators',
    title: 'Self-host and deploy',
    description:
      'Run Claire on your own infrastructure: production setup, Railway deployment, database migrations, and environment reference.',
    href: '/docs/deploy-operate/self-hosting',
    steps: [
      { label: 'Self-hosting', href: '/docs/deploy-operate/self-hosting' },
      { label: 'Production setup', href: '/docs/deploy-operate/production-setup' },
      { label: 'Railway', href: '/docs/deploy-operate/railway' },
    ],
  },
  {
    icon: 'plus',
    eyebrow: 'For builders',
    title: 'Build a plugin',
    description:
      'Extend Claire with scoped, approval-gated automations using the plugin SDK — triggers, policies, and receipts.',
    href: '/docs/extensibility/plugins',
    steps: [
      { label: 'Plugin guide', href: '/docs/extensibility/plugins' },
      { label: 'Plugin system spec', href: '/docs/extensibility/plugin-system' },
    ],
  },
];

/** Product surfaces shown directly below the home introduction. */
export const heroMobileMockups: Array<{ surface: MockupSurface; screen: string; caption: string }> = [
  { surface: 'mobile', screen: 'daily-brief', caption: 'Daily brief' },
  { surface: 'mobile', screen: 'unified-inbox', caption: 'Unified inbox' },
];

export const heroDesktopMockup = {
  surface: 'desktop' as const,
  screen: 'unified-workspace',
  caption: 'Desktop workspace',
};
