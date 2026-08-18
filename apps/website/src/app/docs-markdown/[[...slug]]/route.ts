// SPDX-License-Identifier: Apache-2.0
import { notFound } from 'next/navigation';
import { getDoc, getDocs } from '@/lib/docs';
import { getDocText } from '@/lib/docs-text';

export const revalidate = false;

/**
 * Markdown rendition of a document, reachable at `/docs/<path>.md` through a
 * rewrite. Documentation is authored as React now, so this is derived output
 * for LLM and CLI consumers rather than a source file.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  const doc = getDoc(slug);
  if (!doc) notFound();

  return new Response(getDocText(doc.slug).markdown, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
}

export function generateStaticParams() {
  return getDocs().map((doc) => ({ slug: doc.slug.split('/') }));
}
