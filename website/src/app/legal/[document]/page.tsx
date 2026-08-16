import { notFound } from 'next/navigation';
import { PageHero } from '@/components/site/PageHero';

const documents = {
  privacy: ['PRIVACY', 'Privacy should be specific, testable, and current.', 'This page is a product-language placeholder—not a final legal policy. Before launch it must accurately document collection, retention, subprocessors, user controls, deletion, self-hosting boundaries, and AI-provider egress.'],
  terms: ['TERMS', 'Clear rules for a connected messaging service.', 'This page is a product-language placeholder—not final legal terms. Launch terms must cover account responsibility, connected-network rules, acceptable use, self-hosted software, plugins, AI output, service limits, and dispute terms.'],
} as const;

export function generateStaticParams() { return Object.keys(documents).map((document) => ({ document })); }
export default async function LegalPage({ params }: { params: Promise<{ document: string }> }) {
  const { document } = await params;
  const content = documents[document as keyof typeof documents];
  if (!content) notFound();
  return <main><PageHero eyebrow={content[0]} title={content[1]} intro={content[2]} primary={{ label: 'Security overview', href: '/security' }} /><section className="legal shell"><h2>Before public launch</h2><p>Claire should commission jurisdiction-appropriate legal review and generate this policy from the production data map rather than copying a generic template.</p></section></main>;
}
