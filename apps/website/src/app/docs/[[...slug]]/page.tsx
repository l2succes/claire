// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DocsHome } from '@/components/docs/docs-home';
import { DocsFooter } from '@/components/docs/shell/DocsFooter';
import { DocsPageHeader } from '@/components/docs/shell/DocsPageHeader';
import { DocsToc } from '@/components/docs/shell/DocsToc';
import { getDoc, getDocs } from '@/lib/docs';
import { getDocText } from '@/lib/docs-text';

export default async function Page(props: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await props.params;
  if (!slug?.length) return <DocsHome />;

  const doc = getDoc(slug);
  if (!doc) notFound();

  const { headings, markdown } = getDocText(doc.slug);
  const { Component } = doc;

  return (
    <div className="docs-article">
      <article className="docs-article__content">
        <DocsPageHeader doc={doc} markdown={markdown} />
        <Component />
        <DocsFooter doc={doc} />
      </article>
      <DocsToc headings={headings} />
    </div>
  );
}

export function generateStaticParams() {
  return [{ slug: [] as string[] }, ...getDocs().map((doc) => ({ slug: doc.slug.split('/') }))];
}

export async function generateMetadata(props: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const image = { url: `/docs-og/${(slug ?? []).join('/')}`, width: 1200, height: 630 };

  if (!slug?.length) {
    const title = 'Documentation';
    const description =
      'Architecture, product decisions, operational references, and implementation plans for Claire — published as we build.';
    return {
      title,
      description,
      openGraph: { title, description, images: [image] },
      twitter: { card: 'summary_large_image', title, description, images: [image] },
    };
  }

  const doc = getDoc(slug);
  if (!doc) notFound();

  return {
    title: doc.title,
    description: doc.description,
    openGraph: { title: doc.title, description: doc.description, type: 'article', images: [image] },
    twitter: {
      card: 'summary_large_image',
      title: doc.title,
      description: doc.description,
      images: [image],
    },
  };
}
