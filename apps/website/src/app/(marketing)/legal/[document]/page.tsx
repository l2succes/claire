// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SiteFooter } from '@/components/site/SiteFooter';
import { SiteHeader } from '@/components/site/SiteHeader';
import { legalContactEmail, legalDocuments } from '@/content/legal-documents';

type DocumentKey = keyof typeof legalDocuments;

export function generateStaticParams() {
  return Object.keys(legalDocuments).map((document) => ({ document }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ document: string }>;
}): Promise<Metadata> {
  const { document } = await params;
  const page = legalDocuments[document as DocumentKey];
  return {
    title: page?.title ?? 'Legal',
    description: page?.summary,
  };
}

export default async function LegalPage({ params }: { params: Promise<{ document: string }> }) {
  const { document } = await params;
  const page = legalDocuments[document as DocumentKey];
  if (!page) notFound();

  return (
    <>
      <SiteHeader />
      <main className="shell legal-page">
        <p className="eyebrow">LEGAL</p>
        <h1>{page.title}</h1>
        <p className="legal-page__effective">Effective {page.effectiveDate}</p>
        <p className="legal-page__summary">{page.summary}</p>
        <nav className="legal-page__contents" aria-label={`${page.shortTitle} sections`}>
          <strong>Contents</strong>
          <ol>
            {page.sections.map((section) => (
              <li key={section.id}><a href={`#${section.id}`}>{section.title.replace(/^\d+\.\s*/, '')}</a></li>
            ))}
          </ol>
        </nav>
        <div className="legal-page__body">
          {page.sections.map((section) => (
            <section id={section.id} key={section.id}>
              <h2>{section.title}</h2>
              {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              {section.bullets ? <ul>{section.bullets.map((item) => <li key={item}>{item}</li>)}</ul> : null}
              {section.id === 'contact' || section.id === 'changes-contact' ? (
                <p><a href={`mailto:${legalContactEmail}`}>{legalContactEmail}</a></p>
              ) : null}
            </section>
          ))}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
