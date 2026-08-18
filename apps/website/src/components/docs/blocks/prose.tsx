// SPDX-License-Identifier: Apache-2.0
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Root wrapper for a document body. Sets the reading measure and rhythm. */
export function Doc({ children }: { children: ReactNode }) {
  return <div className="doc">{children}</div>;
}

/**
 * A titled part of a document. The `id` becomes the heading anchor and feeds
 * the table of contents, which is extracted from rendered markup at build time
 * rather than collected at runtime.
 */
export function Section({
  id,
  title,
  level = 2,
  eyebrow,
  children,
}: {
  id: string;
  title: string;
  level?: 2 | 3 | 4;
  eyebrow?: string;
  children: ReactNode;
}) {
  const Heading = `h${level}` as 'h2' | 'h3' | 'h4';
  return (
    <section className={`doc-section doc-section--h${level}`}>
      {eyebrow ? <p className="doc-eyebrow">{eyebrow}</p> : null}
      <Heading className="doc-heading" id={id}>
        {title}
        <a
          className="doc-heading__anchor"
          data-noindex=""
          href={`#${id}`}
          aria-label={`Permalink to ${title}`}
        >
          #
        </a>
      </Heading>
      {children}
    </section>
  );
}

export function P({ children, lede = false }: { children: ReactNode; lede?: boolean }) {
  return <p className={cn('doc-p', lede && 'doc-p--lede')}>{children}</p>;
}

/** A short definition list — better than a two-column table for term/meaning pairs. */
export function Definitions({ items }: { items: Array<{ term: ReactNode; description: ReactNode }> }) {
  return (
    <dl className="doc-definitions">
      {items.map((item, index) => (
        <div key={index}>
          <dt>{item.term}</dt>
          <dd>{item.description}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Data-driven table. Documentation here is table-heavy, and passing rows as
 * data keeps the source readable and the markup (scroll container, sticky
 * header, caption) consistent.
 */
export function Table({
  head,
  rows,
  caption,
  align,
}: {
  head: ReactNode[];
  rows: ReactNode[][];
  caption?: string;
  align?: Array<'left' | 'right' | 'center'>;
}) {
  return (
    <figure className="doc-table">
      <div className="doc-table__scroll">
        <table>
          <thead>
            <tr>
              {head.map((cell, index) => (
                <th key={index} style={{ textAlign: align?.[index] ?? 'left' }} scope="col">
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} style={{ textAlign: align?.[cellIndex] ?? 'left' }}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}

/** A short list of key/value facts rendered as a compact panel. */
export function Facts({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <ul className="doc-facts">
      {items.map((item) => (
        <li key={item.label}>
          <span>{item.label}</span>
          <b>{item.value}</b>
        </li>
      ))}
    </ul>
  );
}

export function Divider() {
  return <hr className="doc-divider" />;
}
