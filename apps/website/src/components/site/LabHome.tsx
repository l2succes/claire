// SPDX-License-Identifier: Apache-2.0
import Link from 'next/link';
import { SiteFooter } from '@/components/site/SiteFooter';
import { SiteHeader } from '@/components/site/SiteHeader';

const labDestinations = [
  {
    href: '/lab/style',
    eyebrow: 'FOUNDATIONS',
    title: 'Style guide',
    body: 'Color, type, surfaces, component anatomy, and the writing system that holds Claire together.',
  },
  {
    href: '/lab/logo',
    eyebrow: 'BRAND',
    title: 'Logo directions',
    body: 'Compare the editable Claire marks, app icons, and the selection criteria behind them.',
  },
  {
    href: '/lab/type',
    eyebrow: 'TYPOGRAPHY',
    title: 'Type lab',
    body: 'Test the interface and display pairings across the product surfaces before choosing a family.',
  },
  {
    href: '/mockups/mobile',
    eyebrow: 'PRODUCT',
    title: 'Mobile reference',
    body: 'The mobile information architecture and high-fidelity screen gallery.',
  },
  {
    href: '/lab/ask',
    eyebrow: 'PRODUCT',
    title: 'Ask Claire',
    body: 'Research, citations, and assistant-in-conversation exploration for the AI workspace.',
  },
  {
    href: '/mockups/desktop',
    eyebrow: 'PRODUCT',
    title: 'Desktop reference',
    body: 'Standalone and companion desktop flows, layouts, and navigation states.',
  },
  {
    href: '/mockups/plugins',
    eyebrow: 'SYSTEMS',
    title: 'Plugin reference',
    body: 'Plugin library, approvals, automation, and activity states for extensibility work.',
  },
] as const;

export function LabHome() {
  return (
    <>
      <SiteHeader />
      <main className="lab-home shell">
        <section className="lab-home__hero">
          <p className="eyebrow">CLAIRE LAB</p>
          <h1>Make the system<br />feel inevitable.</h1>
          <p>
            The working source for Claire’s visual language, product references, and exploratory AI
            experiences. These are living references—not a separate product.
          </p>
        </section>
        <section className="lab-home__grid" aria-label="Claire Lab destinations">
          {labDestinations.map((destination) => (
            <Link className="lab-home__card" href={destination.href} key={destination.href}>
              <span>{destination.eyebrow}</span>
              <h2>{destination.title}</h2>
              <p>{destination.body}</p>
              <b>Open reference <i aria-hidden="true">→</i></b>
            </Link>
          ))}
        </section>
      </main>
      <SiteFooter note="The working reference for Claire’s product and visual system." />
    </>
  );
}
