// SPDX-License-Identifier: Apache-2.0
'use client';

import { SparklesIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useEffect, useRef, useState } from 'react';

type AskResponse = {
  answer?: string;
  sources?: { title: string; url: string }[];
  fallback?: string;
  error?: string;
  message?: string;
};

/** A persistent, docs-wide entry point for the grounded documentation assistant. */
export function AskClaire() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<AskResponse | null>(null);
  const [pending, setPending] = useState(false);

  const open = () => {
    setQuestion('');
    setResult(null);
    if (!dialog.current?.open) dialog.current?.showModal();
  };

  const close = () => dialog.current?.close();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'j') {
        event.preventDefault();
        open();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const ask = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const prompt = question.trim();
    if (!prompt) return;

    setPending(true);
    setResult(null);
    try {
      const response = await fetch('/api/docs/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: prompt }),
      });
      setResult((await response.json()) as AskResponse);
    } catch {
      setResult({
        error: 'network_error',
        fallback: 'search',
        message: 'Ask Claire could not be reached. Use the documentation search instead.',
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <button className="docs-ask__trigger" type="button" onClick={open} aria-haspopup="dialog">
        <SparklesIcon aria-hidden="true" />
        <span>Ask Claire</span>
        <kbd>⌘J</kbd>
      </button>
      <dialog className="docs-ask" ref={dialog} aria-labelledby="ask-claire-title" onCancel={close}>
        <div className="docs-ask__frame">
          <div className="docs-ask__header">
            <div>
              <p>Ask Claire</p>
              <h2 id="ask-claire-title">Search the project, not the web.</h2>
            </div>
            <button className="docs-ask__close" type="button" onClick={close} aria-label="Close Ask Claire">
              <XMarkIcon aria-hidden="true" />
            </button>
          </div>
          <p className="docs-ask__intro">
            Answers are grounded in Claire’s published documentation and include the source pages used.
          </p>
          <form onSubmit={ask}>
            <label htmlFor="ask-claire-question">What are you looking for?</label>
            <textarea
              id="ask-claire-question"
              maxLength={1200}
              rows={4}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="How do I start Claire in mock mode?"
            />
            <div className="docs-ask__actions">
              <span>{pending ? 'Searching the documentation…' : '⌘/Ctrl + J opens Ask Claire anywhere in docs.'}</span>
              <button type="submit" disabled={pending || !question.trim()}>
                {pending ? 'Searching…' : 'Ask Claire'}
              </button>
            </div>
          </form>
          {result?.error ? (
            <p className="docs-ask__notice" role="status">
              {result.message ?? 'Ask Claire is unavailable.'}{' '}
              {result.fallback === 'search' ? 'Try the documentation search.' : null}
            </p>
          ) : null}
          {result?.answer ? (
            <section className="docs-ask__answer" aria-live="polite">
              <h3>Answer</h3>
              <p>{result.answer}</p>
              {result.sources?.length ? (
                <div>
                  <h3>Sources</h3>
                  <ul>
                    {result.sources.map((source) => (
                      <li key={source.url}>
                        <a href={source.url} onClick={close}>
                          {source.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      </dialog>
    </>
  );
}
