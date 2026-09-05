// SPDX-License-Identifier: Apache-2.0
'use client';

import { useEffect, useState } from 'react';
import type { Heading } from '@/lib/docs-text';

/**
 * Table of contents with scroll spy.
 *
 * Headings are supplied by the build step rather than collected from React
 * context, so this stays a presentational client component and the server
 * render already contains the full list.
 */
export function DocsToc({ headings }: { headings: Heading[] }) {
  const [active, setActive] = useState<string | null>(headings[0]?.id ?? null);

  useEffect(() => {
    if (!headings.length) return;
    const elements = headings
      .map((heading) => document.getElementById(heading.id))
      .filter((element): element is HTMLElement => element !== null);
    if (!elements.length) return;

    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        const first = headings.find((heading) => visible.has(heading.id));
        if (first) setActive(first.id);
      },
      { rootMargin: '-88px 0px -70% 0px', threshold: 0 },
    );

    for (const element of elements) observer.observe(element);
    return () => observer.disconnect();
  }, [headings]);

  if (headings.length < 2) return <aside className="docs-toc" aria-hidden="true" />;

  return (
    <aside className="docs-toc">
      <div className="docs-toc__inner">
        <p className="docs-toc__title">On this page</p>
        <ol>
          {headings.map((heading) => (
            <li key={heading.id} data-level={heading.level}>
              <a href={`#${heading.id}`} data-active={heading.id === active || undefined}>
                {heading.text}
              </a>
            </li>
          ))}
        </ol>
      </div>
    </aside>
  );
}
