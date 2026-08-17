// SPDX-License-Identifier: Apache-2.0
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';

type AskResponse = {
  answer?: string;
  sources?: { title: string; url: string }[];
  fallback?: string;
  error?: string;
  message?: string;
};

export function AskClaire() {
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<AskResponse | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <form
      className="ask-claire"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setResult(null);
        const response = await fetch('/api/docs/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question }),
        });
        setResult((await response.json()) as AskResponse);
        setPending(false);
      }}
    >
      <label className="ask-claire-label">
        Ask Claire
      </label>
      <textarea
        className="ask-claire-input"
        maxLength={1200}
        rows={3}
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        placeholder="How do I start Claire in mock mode?"
      />
      <Button type="submit" size="small" disabled={pending || !question.trim()}>
        {pending ? 'Asking…' : 'Ask'}
      </Button>
      {result?.error ? (
        <p className="ask-claire-message">
          {result.message ?? 'Ask Claire is unavailable.'}{' '}
          {result.fallback === 'search' ? 'Use the search box instead.' : null}
        </p>
      ) : null}
      {result?.answer ? (
        <div className="ask-claire-message">
          <p>{result.answer}</p>
          {result.sources?.length ? (
            <ul className="mt-2 list-disc pl-5">
              {result.sources.map((source) => (
                <li key={source.url}>
                  <a href={source.url}>{source.title}</a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
