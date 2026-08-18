// SPDX-License-Identifier: Apache-2.0
import { docModules } from '@/generated/docs-registry';
import {
  docsSections,
  type DocEntry,
  type DocsSection,
  type DocsStatus,
  type RoadmapStatus,
} from '@/lib/docs-types';

const statusOrder: Record<DocsStatus, number> = { current: 0, draft: 1, archived: 2 };

type Catalog = {
  entries: DocEntry[];
  bySlug: Map<string, DocEntry>;
  byUrl: Map<string, DocEntry>;
};

let catalog: Catalog | null = null;

/**
 * Built lazily rather than at module load.
 *
 * The registry imports every document, documents import the block library, and
 * blocks such as `<DocLink>` and `<Roadmap>` read the catalog — a cycle. Doing
 * the work on first call instead of at module initialisation lets that cycle
 * resolve, since nothing needs the catalog until something renders.
 */
function build(): Catalog {
  const entries = Object.entries(docModules)
    .map(([slug, module]) => ({
      ...module.meta,
      slug,
      url: `/docs/${slug}`,
      Component: module.default,
    }))
    .sort((a, b) => {
      const bySection = docsSections.indexOf(a.section) - docsSections.indexOf(b.section);
      if (bySection !== 0) return bySection;
      const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
      const orderB = b.order ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      const byStatus = statusOrder[a.status] - statusOrder[b.status];
      return byStatus !== 0 ? byStatus : a.title.localeCompare(b.title);
    });

  return {
    entries,
    bySlug: new Map(entries.map((doc) => [doc.slug, doc])),
    byUrl: new Map(entries.map((doc) => [doc.url, doc])),
  };
}

function load(): Catalog {
  if (!catalog) catalog = build();
  return catalog;
}

/**
 * Every published document, in reading order: section, then the optional
 * `order` hint, then lifecycle status, then title — so a section's curated
 * entry points lead, current material follows, and archived records sink to
 * the bottom without anyone maintaining an index.
 */
export function getDocs(): DocEntry[] {
  return load().entries;
}

export function getDoc(slug: string | string[] | undefined): DocEntry | undefined {
  if (slug === undefined) return undefined;
  return load().bySlug.get(Array.isArray(slug) ? slug.join('/') : slug);
}

export function getDocByUrl(url: string): DocEntry | undefined {
  return load().byUrl.get(url.replace(/#.*$/, ''));
}

export function docsInSection(section: DocsSection): DocEntry[] {
  return getDocs().filter((doc) => doc.section === section);
}

export function sectionsWithDocs(): Array<{ section: DocsSection; docs: DocEntry[] }> {
  return docsSections
    .map((section) => ({ section, docs: docsInSection(section) }))
    .filter((group) => group.docs.length > 0);
}

export function roadmapDocs(status: RoadmapStatus): DocEntry[] {
  return getDocs().filter((doc) => doc.roadmap?.status === status);
}

/** Previous / next in reading order, used by the page footer. */
export function neighbours(slug: string): { previous?: DocEntry; next?: DocEntry } {
  const entries = getDocs();
  const index = entries.findIndex((doc) => doc.slug === slug);
  if (index < 0) return {};
  return { previous: entries[index - 1], next: entries[index + 1] };
}

export function recentlyReviewed(limit = 5): DocEntry[] {
  return [...getDocs()]
    .filter((doc) => doc.status !== 'archived')
    .sort((a, b) => b.lastReviewed.localeCompare(a.lastReviewed))
    .slice(0, limit);
}
