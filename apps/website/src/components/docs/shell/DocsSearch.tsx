// SPDX-License-Identifier: Apache-2.0
'use client';

import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';
import MiniSearch from 'minisearch';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SEARCH_INDEX_URL, searchOptions, type SearchChunk } from '@/lib/search-options';

type Result = SearchChunk & { score: number };

/**
 * ⌘K search over a MiniSearch index built at build time.
 *
 * The index is fetched on first open rather than with the page, so the docs
 * shell stays light for readers who never search.
 */
export function DocsSearch() {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const index = useRef<MiniSearch<SearchChunk> | null>(null);
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [highlighted, setHighlighted] = useState(0);

  const ensureIndex = useCallback(async () => {
    if (index.current || status === 'loading') return;
    setStatus('loading');
    try {
      const response = await fetch(SEARCH_INDEX_URL);
      index.current = MiniSearch.loadJSON<SearchChunk>(await response.text(), searchOptions);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [status]);

  const open = useCallback(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
    void ensureIndex();
    requestAnimationFrame(() => input.current?.focus());
  }, [ensureIndex]);

  const close = useCallback(() => {
    dialog.current?.close();
    setQuery('');
    setResults([]);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        open();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!index.current || !query.trim()) {
      setResults([]);
      return;
    }
    setResults(index.current.search(query).slice(0, 12) as unknown as Result[]);
    setHighlighted(0);
  }, [query, status]);

  const go = (url: string) => {
    close();
    router.push(url);
  };

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted((current) => Math.min(current + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter' && results[highlighted]) {
      event.preventDefault();
      go(results[highlighted].url);
    }
  };

  return (
    <>
      <button className="docs-search__trigger" type="button" onClick={open}>
        <MagnifyingGlassIcon aria-hidden="true" />
        <span>Search documentation</span>
        <kbd>⌘K</kbd>
      </button>

      <dialog className="docs-search" ref={dialog} onCancel={close} aria-label="Search documentation">
        <div className="docs-search__frame">
          <div className="docs-search__field">
            <MagnifyingGlassIcon aria-hidden="true" />
            <input
              ref={input}
              type="search"
              value={query}
              placeholder="Search every document…"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onInputKeyDown}
              autoComplete="off"
            />
            <button type="button" onClick={close} aria-label="Close search">
              <XMarkIcon aria-hidden="true" />
            </button>
          </div>

          <div className="docs-search__results">
            {status === 'error' ? <p className="docs-search__empty">Search index could not be loaded.</p> : null}
            {status === 'loading' ? <p className="docs-search__empty">Loading the index…</p> : null}
            {status === 'ready' && query.trim() && !results.length ? (
              <p className="docs-search__empty">No matches. Try Ask Claire for a written answer.</p>
            ) : null}
            {!query.trim() && status !== 'loading' ? (
              <p className="docs-search__empty">Type to search titles, headings, and full text.</p>
            ) : null}
            <ul>
              {results.map((result, position) => (
                <li key={result.id}>
                  <button
                    type="button"
                    data-active={position === highlighted || undefined}
                    onClick={() => go(result.url)}
                    onMouseEnter={() => setHighlighted(position)}
                  >
                    <span className="docs-search__crumb">
                      {result.docTitle}
                      {result.heading && result.heading !== result.docTitle ? ` › ${result.heading}` : ''}
                    </span>
                    <span className="docs-search__excerpt">{result.excerpt}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </dialog>
    </>
  );
}
