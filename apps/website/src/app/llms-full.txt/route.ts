// SPDX-License-Identifier: Apache-2.0
import { getDocs } from '@/lib/docs';
import { getDocText } from '@/lib/docs-text';

export const revalidate = false;

/** Every document concatenated, for tools that want the whole corpus at once. */
export function GET() {
  const body = getDocs()
    .map((doc) => `<!-- source: ${doc.url} -->\n\n${getDocText(doc.slug).markdown}`)
    .join('\n\n---\n\n');

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
