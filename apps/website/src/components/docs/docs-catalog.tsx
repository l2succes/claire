// SPDX-License-Identifier: Apache-2.0
'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { HeroIcon } from '@/components/site/HeroIcon';
import {
  docsSections,
  sectionDescriptions,
  sectionIcons,
  sectionLabels,
  statusLabels,
  type DocsSection,
  type DocsStatus,
} from '@/lib/docs-types';

export type CatalogEntry = {
  title: string;
  url: string;
  description: string;
  section: DocsSection;
  status: DocsStatus;
  lastReviewed: string;
  roadmapStatus?: string;
};

const statuses: DocsStatus[] = ['current', 'draft', 'archived'];

/** The full, filterable catalog. Lives at `/docs/all` so the home page can be curated. */
export function DocsCatalog({ docs }: { docs: CatalogEntry[] }) {
  const [query, setQuery] = useState('');
  const [section, setSection] = useState<DocsSection | null>(null);
  const [status, setStatus] = useState<DocsStatus | null>(null);
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return docs.filter((doc) => {
      const haystack = `${doc.title} ${doc.description} ${sectionLabels[doc.section]}`.toLowerCase();
      return (
        (!needle || haystack.includes(needle)) &&
        (!section || doc.section === section) &&
        (!status || doc.status === status)
      );
    });
  }, [docs, query, section, status]);

  const grouped = useMemo(
    () =>
      docsSections
        .map((item) => ({ section: item, docs: visible.filter((doc) => doc.section === item) }))
        .filter((group) => group.docs.length > 0),
    [visible],
  );

  return (
    <div className="docs-catalog">
      <header className="docs-catalog__head">
        <p className="doc-eyebrow">Everything, filterable</p>
        <h1>All documentation</h1>
        <p className="docs-catalog__lede">
          {docs.length} documents across seven sections. Filter by purpose or lifecycle, or press ⌘K to
          search the full text of every page.
        </p>
      </header>

      <div className="docs-catalog__controls">
        <label className="docs-catalog__search">
          <HeroIcon name="search" size="sm" />
          <input
            type="search"
            value={query}
            placeholder="Filter titles and summaries"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <div className="docs-catalog__chips" role="group" aria-label="Filter by section">
          <button type="button" data-active={section === null || undefined} onClick={() => setSection(null)}>
            All sections
          </button>
          {docsSections.map((item) => (
            <button
              key={item}
              type="button"
              data-active={section === item || undefined}
              onClick={() => setSection(section === item ? null : item)}
            >
              {sectionLabels[item]}
            </button>
          ))}
        </div>

        <div className="docs-catalog__chips" role="group" aria-label="Filter by status">
          <button type="button" data-active={status === null || undefined} onClick={() => setStatus(null)}>
            Any status
          </button>
          {statuses.map((item) => (
            <button
              key={item}
              type="button"
              data-status={item}
              data-active={status === item || undefined}
              onClick={() => setStatus(status === item ? null : item)}
            >
              {statusLabels[item]}
            </button>
          ))}
          <span className="docs-catalog__spacer" />
          <button
            type="button"
            className="docs-catalog__layout"
            onClick={() => setLayout(layout === 'grid' ? 'list' : 'grid')}
          >
            {layout === 'grid' ? 'List view' : 'Grid view'}
          </button>
        </div>
      </div>

      <p className="docs-catalog__count" aria-live="polite">
        {visible.length} of {docs.length} documents
      </p>

      <div className="docs-catalog__sections" data-layout={layout}>
        {grouped.map((group) => (
          <section key={group.section} id={group.section} aria-labelledby={`heading-${group.section}`}>
            <div className="docs-catalog__section-head">
              <HeroIcon name={sectionIcons[group.section]} size="sm" />
              <h2 id={`heading-${group.section}`}>{sectionLabels[group.section]}</h2>
              <p>{sectionDescriptions[group.section]}</p>
            </div>
            <div className="docs-catalog__grid">
              {group.docs.map((doc) => (
                <Link className="docs-catalog__card" href={doc.url} key={doc.url}>
                  <span className="docs-catalog__card-meta">
                    <span className="docs-status" data-status={doc.status}>
                      {statusLabels[doc.status]}
                    </span>
                    <em>Reviewed {doc.lastReviewed}</em>
                  </span>
                  <b>{doc.title}</b>
                  <span className="docs-catalog__card-description">{doc.description}</span>
                </Link>
              ))}
            </div>
          </section>
        ))}
        {!grouped.length ? (
          <p className="docs-catalog__empty">
            Nothing matches those filters. Clear them, or press ⌘K to search the full text.
          </p>
        ) : null}
      </div>
    </div>
  );
}
