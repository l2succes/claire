// SPDX-License-Identifier: Apache-2.0
import generated from '@/generated/docs-text.json';

export type Heading = { id: string; text: string; level: number };
export type DocText = { markdown: string; text: string; headings: Heading[] };

/**
 * Text renditions of each document, derived at build time by
 * `scripts/extract-docs-text.ts`. Keyed by slug.
 */
const docsText = generated as Record<string, DocText>;

const empty: DocText = { markdown: '', text: '', headings: [] };

export function getDocText(slug: string): DocText {
  return docsText[slug] ?? empty;
}

export function allDocText(): Array<{ slug: string } & DocText> {
  return Object.entries(docsText).map(([slug, value]) => ({ slug, ...value }));
}
