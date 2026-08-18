import { notFound } from 'next/navigation';
import { PageHero } from '@/components/site/PageHero';

const references = {
  mobile: ['MOBILE PRODUCT REFERENCE', 'The complete pocket workflow.', 'Inbox, chat, centered Ask Claire action, global search, promises, people, relationship memory, settings, and connection setup.', ['390 × 844 reference frame', 'Five-position tab architecture', 'Heroicons with 44px touch targets', 'Offline and permission states']],
  desktop: ['DESKTOP PRODUCT REFERENCE', 'A full client and a capable companion.', 'Unified workspace, collapsible navigation, chat detail, Ask Claire, people, connections, local bridge health, and secure desktop authorization.', ['Open and collapsed rails', 'Multi-pane density rules', 'Contact detail and new conversation', 'Standalone and companion modes']],
  plugins: ['PLUGIN PRODUCT REFERENCE', 'Safe actions that begin in conversation.', 'Marketplace discovery, install review, permissions, trigger configuration, approval, run history, errors, and developer tooling.', ['Explicit scope review', 'Human-in-the-loop actions', 'Cloud and local compatibility', 'Observable run history']],
} as const;

export function generateStaticParams() { return Object.keys(references).map((reference) => ({ reference })); }
export default async function ReferencePage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const content = references[reference as keyof typeof references];
  if (!content) notFound();
  return <main><PageHero eyebrow={content[0]} title={content[1]} intro={content[2]} primary={{ label: 'View components', href: '/developers/components' }} /><section className={`reference-canvas reference-canvas--${reference} shell`}><div className="reference-sidebar"><p className="eyebrow">REFERENCE COVERAGE</p>{content[3].map((item, index) => <div key={item}><span>0{index + 1}</span><b>{item}</b></div>)}</div><div className="reference-preview"><div className="preview-top"><span></span><span></span><span></span><b>{reference.toUpperCase()} SYSTEM</b></div><div className="preview-body"><div className="preview-rail"></div><div className="preview-content"><p className="eyebrow">MIGRATION IN PROGRESS</p><h2>The existing high-fidelity {reference} gallery is the visual baseline.</h2><p>This Next.js route now owns the durable navigation and documentation context. The individual screen specimens will move here component-by-component, with parity checks against the original static gallery.</p><div className="preview-lines"><i></i><i></i><i></i></div></div></div></div></section></main>;
}
