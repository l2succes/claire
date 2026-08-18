// SPDX-License-Identifier: Apache-2.0
import Link from 'next/link';
import { CopyButton } from '@/components/docs/blocks/copy-button';
import { Diagram, Mockup, Platforms } from '@/components/docs/blocks';
import { sectionLabels, statusLabels, type DocEntry } from '@/lib/docs-types';

const GITHUB_CONTENT = 'https://github.com/l2succes/claire/blob/main/website/src/content/docs';

export function DocsPageHeader({ doc, markdown }: { doc: DocEntry; markdown: string }) {
  return (
    <header className="docs-page-header">
      <nav className="docs-page-header__crumbs" aria-label="Breadcrumb">
        <Link href="/docs">Docs</Link>
        <span aria-hidden="true">/</span>
        <Link href={`/docs/all#${doc.section}`}>{sectionLabels[doc.section]}</Link>
      </nav>

      <h1>{doc.title}</h1>
      <p className="docs-page-header__description">{doc.description}</p>

      <div className="docs-page-header__meta">
        <span className="docs-status" data-status={doc.status}>
          {statusLabels[doc.status]}
        </span>
        {doc.roadmap ? (
          <span className="docs-status" data-roadmap={doc.roadmap.status}>
            {doc.roadmap.status.replace('_', ' ')}
          </span>
        ) : null}
        <span className="docs-page-header__reviewed">Reviewed {doc.lastReviewed}</span>
        <span className="docs-page-header__spacer" />
        <CopyButton value={markdown} label="Copy as Markdown" />
        <a className="docs-page-header__source" href={`${GITHUB_CONTENT}/${doc.slug}.tsx`} rel="noreferrer" target="_blank">
          View source ↗
        </a>
      </div>

      {doc.hero ? <DocHero doc={doc} /> : null}
    </header>
  );
}

function DocHero({ doc }: { doc: DocEntry }) {
  const hero = doc.hero;
  if (!hero) return null;
  if (hero.kind === 'mockup') {
    return <Mockup surface={hero.surface} screen={hero.screen} caption={hero.caption} />;
  }
  if (hero.kind === 'platforms') return <Platforms status={['available', 'beta']} />;
  if (hero.kind === 'diagram' && hero.chart) {
    return <Diagram caption={hero.caption}>{hero.chart}</Diagram>;
  }
  return null;
}
