// SPDX-License-Identifier: Apache-2.0
import { getDocsIndex, retrieveDocs } from '@/lib/docs-index';
import {
  ASK_MODEL,
  checkBudget,
  checkRateLimit,
  getCachedAnswer,
  getClientIp,
  hashQuestion,
  MAX_ANSWER_CHARS,
  MAX_QUESTION_CHARS,
  recordSpend,
  setCachedAnswer,
} from '@/lib/ask-claire';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rate = checkRateLimit(ip);
  if (!rate.ok) {
    return Response.json(
      { error: 'rate_limited', retryAfter: rate.retryAfter, fallback: 'search' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }

  const question =
    typeof body === 'object' && body && 'question' in body && typeof body.question === 'string'
      ? body.question.trim()
      : '';

  if (!question) {
    return Response.json({ error: 'question_required' }, { status: 400 });
  }
  if (question.length > MAX_QUESTION_CHARS) {
    return Response.json(
      { error: 'question_too_long', max: MAX_QUESTION_CHARS },
      { status: 413 },
    );
  }

  const hash = hashQuestion(question);
  const cached = getCachedAnswer(hash);
  if (cached) {
    return Response.json({ answer: cached.answer, sources: cached.sources, cached: true, model: ASK_MODEL });
  }

  if (!process.env.OPENAI_API_KEY) {
    return Response.json(
      {
        error: 'ai_unavailable',
        fallback: 'search',
        message: 'Ask Claire is disabled until OPENAI_API_KEY is configured. Use /api/search.',
      },
      { status: 503 },
    );
  }

  const budget = checkBudget();
  if (!budget.ok) {
    return Response.json(
      { error: 'budget_exhausted', fallback: 'search', spentUsd: budget.spent },
      { status: 429 },
    );
  }

  const index = await getDocsIndex();
  const sources = retrieveDocs(question, index);
  if (sources.length === 0) {
    return Response.json({
      answer: 'I could not find matching Claire docs. Try the search box on /docs.',
      sources: [],
      model: ASK_MODEL,
    });
  }

  const context = sources
    .map((source, i) => `[${i + 1}] ${source.title} (${source.url})\n${source.text.slice(0, 1800)}`)
    .join('\n\n');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: ASK_MODEL,
      temperature: 0.2,
      max_tokens: 700,
      messages: [
        {
          role: 'system',
          content:
            'You are Ask Claire for the Claire open-source docs. Answer only from the provided sources. Cite sources as [n]. If the sources are insufficient, say so and suggest /api/search. Do not invent APIs, hosts, or privacy guarantees.',
        },
        {
          role: 'user',
          content: `Question:\n${question}\n\nSources:\n${context}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    return Response.json(
      { error: 'provider_error', fallback: 'search', status: response.status },
      { status: 502 },
    );
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const answer = (payload.choices?.[0]?.message?.content ?? '').slice(0, MAX_ANSWER_CHARS);
  const result = {
    answer,
    sources: sources.map((source) => ({ title: source.title, url: source.url })),
    model: ASK_MODEL,
  };

  recordSpend();
  setCachedAnswer(hash, { answer: result.answer, sources: result.sources });
  return Response.json(result);
}
