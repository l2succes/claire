// SPDX-License-Identifier: Apache-2.0
import Link from 'next/link';
import { Mockup } from '@/components/docs/blocks/mockup';
import { RoadmapTeaser } from '@/components/docs/blocks/roadmap';
import { HeroIcon } from '@/components/site/HeroIcon';
import { getDocs, recentlyReviewed, sectionsWithDocs } from '@/lib/docs';
import { heroDesktopMockup, heroMobileMockups, startPaths } from '@/lib/docs-home';
import { sectionDescriptions, sectionIcons, sectionLabels } from '@/lib/docs-types';

/**
 * The documentation home.
 *
 * Deliberately not a list of everything: the full catalog lives at `/docs/all`.
 * This page answers "what is this, and where do I start?" and shows the product
 * it is describing.
 */
export function DocsHome() {
  const total = getDocs().length;
  const sections = sectionsWithDocs();

  return (
    <div className="docs-home">
      <section className="docs-home__hero">
        <div className="docs-home__hero-copy">
          <p className="doc-eyebrow">Open documentation</p>
          <h1>We build Claire in the open.</h1>
          <p className="docs-home__statement">Including the parts that aren&rsquo;t finished.</p>
          <p className="docs-home__lede">
            Architecture, product specifications, operational runbooks, and live implementation plans —
            the same {total} documents the team works from, published as they change.
          </p>
          <div className="docs-home__hero-actions">
            <Link className="docs-home__cta" href="/docs/get-started/quickstart">
              Start building <HeroIcon name="arrow-right" size="sm" />
            </Link>
            <Link className="docs-home__cta docs-home__cta--ghost" href="/docs/product/roadmap">
              See the roadmap
            </Link>
          </div>
        </div>
      </section>

      <section className="docs-home__showcase" aria-label="Claire product previews">
        <div className="docs-home__mobile-previews">
          {heroMobileMockups.map((mockup) => (
            <Mockup key={mockup.screen} {...mockup} align="start" />
          ))}
        </div>
        <div className="docs-home__desktop-preview">
          <Mockup {...heroDesktopMockup} align="start" />
        </div>
      </section>

      <section className="docs-home__paths" aria-labelledby="start-here">
        <div className="docs-home__section-head">
          <h2 id="start-here">Start here</h2>
          <p>Four routes through the documentation, depending on what you came to do.</p>
        </div>
        <div className="docs-home__path-grid">
          {startPaths.map((path) => (
            <article className="docs-home__path" key={path.href}>
              <HeroIcon name={path.icon} size="md" />
              <p className="doc-eyebrow">{path.eyebrow}</p>
              <h3>
                <Link href={path.href}>{path.title}</Link>
              </h3>
              <p>{path.description}</p>
              <ol>
                {path.steps.map((step, index) => (
                  <li key={step.href}>
                    <span>{index + 1}</span>
                    <Link href={step.href}>{step.label}</Link>
                  </li>
                ))}
              </ol>
            </article>
          ))}
        </div>
      </section>

      <section className="docs-home__roadmap" aria-labelledby="in-progress">
        <div className="docs-home__section-head">
          <h2 id="in-progress">What we&rsquo;re working on</h2>
          <p>
            Pulled from document metadata, so it cannot describe work that has no documentation.{' '}
            <Link href="/docs/product/roadmap">See the full board →</Link>
          </p>
        </div>
        <RoadmapTeaser />
      </section>

      <section className="docs-home__sections" aria-labelledby="browse">
        <div className="docs-home__section-head">
          <h2 id="browse">Browse by purpose</h2>
          <p>
            Every document belongs to exactly one section.{' '}
            <Link href="/docs/all">Search and filter all {total} →</Link>
          </p>
        </div>
        <div className="docs-home__section-grid">
          {sections.map(({ section, docs }) => (
            <Link className="docs-home__section-card" href={`/docs/all#${section}`} key={section}>
              <HeroIcon name={sectionIcons[section]} size="sm" />
              <b>{sectionLabels[section]}</b>
              <span>{sectionDescriptions[section]}</span>
              <em>
                {docs.length} document{docs.length === 1 ? '' : 's'}
              </em>
            </Link>
          ))}
        </div>
      </section>

      <section className="docs-home__recent" aria-labelledby="recent">
        <div className="docs-home__section-head">
          <h2 id="recent">Recently reviewed</h2>
          <p>Every document carries a review date; these are the freshest.</p>
        </div>
        <ul>
          {recentlyReviewed(5).map((doc) => (
            <li key={doc.url}>
              <Link href={doc.url}>
                <b>{doc.title}</b>
                <span>{doc.description}</span>
                <em>{doc.lastReviewed}</em>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
