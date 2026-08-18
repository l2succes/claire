// SPDX-License-Identifier: Apache-2.0
import type { ComponentType } from 'react';
import type { HeroIconName } from '@/components/site/HeroIcon';

export const docsSections = [
  'get-started',
  'build-claire',
  'deploy-operate',
  'product',
  'extensibility',
  'plans',
  'contribute',
] as const;

export type DocsSection = (typeof docsSections)[number];
export type DocsStatus = 'current' | 'draft' | 'archived';
export type RoadmapStatus = 'shipped' | 'in_progress' | 'planned' | 'research';

/** Concept galleries plus the fixture-backed React Native Web app surface. */
export type MockupSurface = 'mobile' | 'mobile-app' | 'desktop' | 'plugins';

export type DocHero =
  | { kind: 'mockup'; surface: MockupSurface; screen: string; caption?: string }
  | { kind: 'diagram'; chart: string; caption?: string }
  | { kind: 'platforms' };

/**
 * Every documentation module exports one of these as `meta`.
 *
 * Unlike the frontmatter it replaces, this is checked by the compiler: an
 * invalid section, status, or roadmap stage is a typecheck failure rather than
 * a build-script assertion. `scripts/build-docs.ts` still validates the things
 * types cannot express (date format, link targets, duplicate routes).
 */
export type DocMeta = {
  title: string;
  description: string;
  section: DocsSection;
  status: DocsStatus;
  /** ISO `YYYY-MM-DD`. Validated by the build script. */
  lastReviewed: string;
  roadmap?: { status: RoadmapStatus; summary: string; issue?: string };
  hero?: DocHero;
  /** Internal `/docs/...` routes shown as "keep reading" links. */
  related?: string[];
  /** Sort hint within a section. Lower first; unset sorts after all numbered docs. */
  order?: number;
  /**
   * Escape hatch for search/LLM text when a page cannot be rendered outside
   * Next.js. No current block needs it.
   */
  searchText?: string;
};

/** The shape `scripts/build-docs.ts` expects every content module to have. */
export type DocModule = {
  meta: DocMeta;
  default: ComponentType;
};

/** A doc plus its derived routing information. */
export type DocEntry = DocMeta & {
  slug: string;
  url: string;
  Component: ComponentType;
};

export const sectionLabels: Record<DocsSection, string> = {
  'get-started': 'Get started',
  'build-claire': 'Build Claire',
  'deploy-operate': 'Deploy & operate',
  product: 'Product & roadmap',
  extensibility: 'Extensibility',
  plans: 'Plans',
  contribute: 'Contribute',
};

export const sectionDescriptions: Record<DocsSection, string> = {
  'get-started': 'Set up a local Claire workspace and explore the product safely.',
  'build-claire': 'Architecture, clients, testing, and shared interface work.',
  'deploy-operate': 'Self-hosting, infrastructure, environment, and production references.',
  product: 'Capabilities, roadmap, product specifications, and public security boundaries.',
  extensibility: 'Build and operate Claire plugins.',
  plans: 'Active implementation plans and historical delivery records.',
  contribute: 'How the project is built, reviewed, and improved in public.',
};

export const sectionIcons: Record<DocsSection, HeroIconName> = {
  'get-started': 'sparkles',
  'build-claire': 'desktop',
  'deploy-operate': 'server',
  product: 'inbox',
  extensibility: 'plus',
  plans: 'check-circle',
  contribute: 'people',
};

export const statusLabels: Record<DocsStatus, string> = {
  current: 'Current',
  draft: 'Draft',
  archived: 'Archived',
};

export const roadmapLabels: Record<RoadmapStatus, string> = {
  shipped: 'Shipped',
  in_progress: 'In progress',
  planned: 'Planned',
  research: 'Research',
};

export const roadmapOrder: readonly RoadmapStatus[] = ['shipped', 'in_progress', 'planned', 'research'];
