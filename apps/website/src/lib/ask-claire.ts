// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';

export const ASK_MODEL = process.env.CLAIRE_DOCS_ASK_MODEL ?? 'gpt-5.4-mini';
export const MONTHLY_BUDGET_USD = Number(process.env.CLAIRE_DOCS_ASK_MONTHLY_BUDGET_USD ?? '50');
export const ESTIMATED_COST_USD = 0.002;
export const MAX_QUESTION_CHARS = 1200;
export const MAX_ANSWER_CHARS = 4000;
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 10 * 60 * 1000;

type RateBucket = { count: number; resetAt: number };

const rateBuckets = new Map<string, RateBucket>();
const questionCache = new Map<string, { answer: string; sources: { title: string; url: string }[] }>();

let spendUsd = 0;
let spendMonth = currentMonth();

function currentMonth() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}`;
}

export function hashQuestion(question: string) {
  return createHash('sha256').update(question.trim().toLowerCase()).digest('hex');
}

export function getClientIp(request: Request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

export function checkRateLimit(ip: string) {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { ok: true as const };
  }
  if (bucket.count >= RATE_LIMIT) {
    return { ok: false as const, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count += 1;
  return { ok: true as const };
}

export function checkBudget() {
  const month = currentMonth();
  if (spendMonth !== month) {
    spendMonth = month;
    spendUsd = 0;
  }
  if (spendUsd + ESTIMATED_COST_USD > MONTHLY_BUDGET_USD) {
    return { ok: false as const, spent: spendUsd };
  }
  return { ok: true as const, spent: spendUsd };
}

export function recordSpend() {
  spendUsd += ESTIMATED_COST_USD;
  return spendUsd;
}

export function getCachedAnswer(hash: string) {
  return questionCache.get(hash);
}

export function setCachedAnswer(
  hash: string,
  value: { answer: string; sources: { title: string; url: string }[] },
) {
  questionCache.set(hash, value);
}

export type DocsChunk = { title: string; url: string; description: string; text: string };

/**
 * Naive but predictable retrieval: term overlap across title, description, and
 * body. Grounding quality matters more than ranking sophistication here, and
 * the corpus is small enough that this stays fast without an embedding store.
 */
export function retrieveDocs(question: string, index: DocsChunk[], limit = 4) {
  const terms = question
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 2);

  return index
    .map((chunk) => {
      const haystack = `${chunk.title} ${chunk.description} ${chunk.text}`.toLowerCase();
      const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
      return { chunk, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.chunk);
}
