// SPDX-License-Identifier: Apache-2.0
import { getDocByUrl } from '@/lib/docs';

/**
 * A cross-reference to another document. With no children it renders the
 * target's own title, so renaming a doc updates every link to it.
 *
 * `scripts/build-docs.ts` fails the build on an unresolvable target, which is
 * why this can assume the lookup succeeds at render time.
 */
export function DocLink({ to, children }: { to: string; children?: string }) {
  const doc = getDocByUrl(to);
  return (
    <a className="doc-link" href={to} title={doc?.description}>
      {children ?? doc?.title ?? to}
    </a>
  );
}

/** A "keep reading" row rendered from `meta.related`. */
export function Related({ urls }: { urls: string[] }) {
  const targets = urls.map((url) => getDocByUrl(url)).filter((doc) => doc !== undefined);
  if (!targets.length) return null;

  return (
    <nav className="doc-related" aria-label="Related documentation">
      <p className="doc-eyebrow">Keep reading</p>
      <ul>
        {targets.map((doc) => (
          <li key={doc.url}>
            <a href={doc.url}>
              <b>{doc.title}</b>
              <span>{doc.description}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
