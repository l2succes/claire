// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SiteFooter } from '@/components/site/SiteFooter';
import { SiteHeader } from '@/components/site/SiteHeader';

const documents = {
  privacy: {
    title: 'Privacy',
    body: 'Claire is alpha. If you join the waitlist, we store your email address, signup source, consent time, and optional campaign/referrer data so we can send build notes and early-access invitations. You can unsubscribe from any email. Roadmap votes use a random first-party browser identifier to prevent duplicate votes; they do not store your email address or IP. Message data synchronized into Claire is stored so the unified inbox, search, and optional AI features can work. Connected networks keep their own privacy policies. Configured AI providers may receive selected conversation context. A verified desktop-only mode is not available yet.',
  },
  terms: {
    title: 'Terms',
    body: 'Claire software is provided as an early open-source project. Apache-2.0 covers clients, website, packages, and documentation. AGPL-3.0 covers the server and operational infrastructure. Trademarks remain with their owners. Do not treat this page as finished legal counsel.',
  },
} as const;

type DocumentKey = keyof typeof documents;

export function generateStaticParams() {
  return Object.keys(documents).map((document) => ({ document }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ document: string }>;
}): Promise<Metadata> {
  const { document } = await params;
  const page = documents[document as DocumentKey];
  return { title: page?.title ?? 'Legal' };
}

export default async function LegalPage({ params }: { params: Promise<{ document: string }> }) {
  const { document } = await params;
  const page = documents[document as DocumentKey];
  if (!page) notFound();

  return (
    <>
      <SiteHeader />
      <main className="shell legal-page">
        <p className="eyebrow">LEGAL PLACEHOLDER</p>
        <h1>{page.title}</h1>
        <p>{page.body}</p>
        <p>
          See <a href="https://github.com/l2succes/claire/blob/main/SECURITY.md">SECURITY.md</a> and{' '}
          <a href="/security">the security page</a> for current product boundaries.
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
