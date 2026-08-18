// SPDX-License-Identifier: Apache-2.0
import { platformCatalog } from '@claire/platform-catalog';
import { PlatformMark } from '@/components/site/PlatformMark';
import { getDocs, roadmapDocs } from '@/lib/docs';
import { roadmapLabels, roadmapOrder } from '@/lib/docs-types';

/**
 * The public roadmap, assembled from document metadata rather than a
 * hand-maintained list — every card links to the specification, guide, or
 * implementation record behind it, so the board cannot describe work that has
 * no documentation.
 */
export function Roadmap({ connectors = true }: { connectors?: boolean }) {
  const available = platformCatalog.filter((platform) => platform.supportStatus === 'available');
  const planned = platformCatalog.filter((platform) => platform.supportStatus !== 'available');
  const counts = roadmapOrder.map((status) => ({
    status,
    items: roadmapDocs(status),
  }));

  return (
    <div className="doc-roadmap">
      {connectors ? (
        <section className="doc-roadmap__connectors" aria-label="Connector availability">
          <div>
            <p className="doc-eyebrow">Available now</p>
            <h2>Supported connectors</h2>
            <ul className="doc-roadmap__marks">
              {available.map((platform) => (
                <li key={platform.id}>
                  <PlatformMark platform={platform} size="md" />
                  <b>{platform.name}</b>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="doc-eyebrow">On the way</p>
            <h2>Not yet connected</h2>
            <ul className="doc-roadmap__marks doc-roadmap__marks--muted">
              {planned.map((platform) => (
                <li key={platform.id}>
                  <PlatformMark platform={platform} size="md" />
                  <b>{platform.name}</b>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <div className="doc-roadmap__columns">
        {counts.map(({ status, items }) => (
          <section className="doc-roadmap__column" key={status} data-status={status}>
            <header>
              <h2>{roadmapLabels[status]}</h2>
              <span>{items.length}</span>
            </header>
            {items.length ? (
              <ol>
                {items.map((doc) => (
                  <li key={doc.url}>
                    <a href={doc.url}>{doc.title}</a>
                    <p>{doc.roadmap?.summary}</p>
                    {doc.roadmap?.issue ? (
                      <a href={doc.roadmap.issue} rel="noreferrer" target="_blank">
                        Follow the issue ↗
                      </a>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="doc-roadmap__empty">No public items in this stage yet.</p>
            )}
          </section>
        ))}
      </div>
      <p className="doc-roadmap__note">
        Assembled from the metadata of {getDocs().length} published documents. A card appears here as soon as
        its document declares a roadmap stage.
      </p>
    </div>
  );
}

/** Condensed board for the documentation home. */
export function RoadmapTeaser({ limit = 4 }: { limit?: number }) {
  const items = roadmapDocs('in_progress').slice(0, limit);
  if (!items.length) return null;

  return (
    <ul className="doc-roadmap-teaser">
      {items.map((doc) => (
        <li key={doc.url}>
          <a href={doc.url}>
            <span className="doc-eyebrow">In progress</span>
            <b>{doc.title}</b>
            <span>{doc.roadmap?.summary}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
