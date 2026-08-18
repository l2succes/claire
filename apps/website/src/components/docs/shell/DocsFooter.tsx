// SPDX-License-Identifier: Apache-2.0
import Link from 'next/link';
import { Related } from '@/components/docs/blocks';
import { neighbours } from '@/lib/docs';
import type { DocEntry } from '@/lib/docs-types';

export function DocsFooter({ doc }: { doc: DocEntry }) {
  const { previous, next } = neighbours(doc.slug);

  return (
    <footer className="docs-page-footer">
      {doc.related?.length ? <Related urls={doc.related} /> : null}

      <nav className="docs-page-footer__nav" aria-label="Previous and next document">
        {previous ? (
          <Link className="docs-page-footer__link" href={previous.url} data-direction="previous">
            <span>← Previous</span>
            <b>{previous.title}</b>
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link className="docs-page-footer__link" href={next.url} data-direction="next">
            <span>Next →</span>
            <b>{next.title}</b>
          </Link>
        ) : (
          <span />
        )}
      </nav>

      <p className="docs-page-footer__note">
        Something wrong or missing?{' '}
        <a href="https://github.com/l2succes/claire/issues/new" rel="noreferrer" target="_blank">
          Open an issue
        </a>{' '}
        — this documentation is part of the repository and is reviewed like code.
      </p>
    </footer>
  );
}
