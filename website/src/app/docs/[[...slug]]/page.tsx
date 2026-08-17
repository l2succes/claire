// SPDX-License-Identifier: Apache-2.0
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
  MarkdownCopyButton,
  ViewOptionsPopover,
} from 'fumadocs-ui/layouts/docs/page';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AskClaire } from '@/components/docs/ask-claire';
import { DocsHome } from '@/components/docs/DocsHome';
import { getMDXComponents } from '@/components/mdx';
import { source } from '@/lib/source';

export default async function Page(props: { params: Promise<{ slug?: string[] }> }) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  if (!params.slug?.length) {
    return (
      <DocsPage
        full
        toc={[]}
        breadcrumb={{ enabled: false }}
        footer={{ enabled: false }}
        tableOfContent={{ enabled: false }}
        tableOfContentPopover={{ enabled: false }}
      >
        <DocsHome />
      </DocsPage>
    );
  }

  const MDX = page.data.body;
  const markdownUrl = `${page.url}.md`;
  const githubPath = page.path.replace(/^\/?/, '');
  const githubUrl = `https://github.com/l2succes/claire/blob/main/docs/${githubPath}`;

  return (
    <DocsPage toc={page.data.toc} full={page.data.full} className="docs-article">
      <p className="docs-article-kicker">Claire developer docs</p>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <AskClaire />
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <MarkdownCopyButton markdownUrl={markdownUrl} />
        <ViewOptionsPopover markdownUrl={markdownUrl} githubUrl={githubUrl} />
      </div>
      <DocsBody>
        <MDX
          components={getMDXComponents({
            a: createRelativeLink(source, page),
          })}
        />
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
  };
}
