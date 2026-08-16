// SPDX-License-Identifier: Apache-2.0
import { source } from '@/lib/source';

export type DocsChunk = {
  title: string;
  url: string;
  description: string;
  text: string;
};

let cached: DocsChunk[] | null = null;

export async function getDocsIndex(): Promise<DocsChunk[]> {
  if (cached) return cached;

  const pages = source.getPages();
  cached = await Promise.all(
    pages.map(async (page) => {
      const text = await page.data.getText('processed').catch(() => page.data.description ?? '');
      return {
        title: page.data.title,
        url: page.url,
        description: page.data.description ?? '',
        text,
      };
    }),
  );
  return cached;
}

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
