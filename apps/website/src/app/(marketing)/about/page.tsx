// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import {
  SITE_URL,
  aboutFaq,
  audiences,
  differentiators,
  howItWorks,
  keyFacts,
  services,
  team,
  valueProp,
} from '@/content/about';
import { PageHero } from '@/components/site/PageHero';
import { SiteFooter } from '@/components/site/SiteFooter';
import { SiteHeader } from '@/components/site/SiteHeader';
import '@/styles/about.css';

export const metadata: Metadata = {
  title: 'About Claire',
  description: valueProp,
  alternates: { canonical: '/about' },
};

const structuredData = [
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Claire',
    url: SITE_URL,
    logo: `${SITE_URL}/assets/brand/claire-app-icon-lime.svg`,
    description: valueProp,
    foundingDate: '2025',
    founder: team.founders.map((founder) => ({
      '@type': 'Person',
      name: founder.name,
      sameAs: founder.links.map((link) => link.href),
    })),
    sameAs: ['https://github.com/l2succes/claire'],
  },
  {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: aboutFaq.map(([question, answer]) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: { '@type': 'Answer', text: answer },
    })),
  },
];

function AboutSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="about-section" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      <div>{children}</div>
    </section>
  );
}

function AboutItem({ title, body }: { title: string; body: string }) {
  return (
    <article className="about-item">
      <h3>{title}</h3>
      <p>{body}</p>
    </article>
  );
}

export default function AboutPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <SiteHeader />
      <main className="shell about-page">
        <PageHero
          eyebrow="ABOUT CLAIRE"
          title="All your chats."
          highlight="Nothing left open."
          intro={valueProp}
          primary={{ href: '/pricing', label: 'See pricing' }}
          secondary={{ href: 'https://github.com/l2succes/claire', label: 'Read the source' }}
        />

        <AboutSection id="what" title="What Claire does">
          {services.map((item) => (
            <AboutItem key={item.title} {...item} />
          ))}
        </AboutSection>

        <AboutSection id="different" title="What makes Claire different">
          {differentiators.map((item) => (
            <AboutItem key={item.title} {...item} />
          ))}
        </AboutSection>

        <AboutSection id="who" title="Who uses Claire">
          <ul className="about-list">
            {audiences.map((audience) => (
              <li key={audience}>{audience}</li>
            ))}
          </ul>
        </AboutSection>

        <AboutSection id="team" title="The team behind Claire">
          <p className="about-lede">{team.origin}</p>
          {team.founders.map((founder) => (
            <article className="about-item" key={founder.name}>
              <h3>
                {founder.name} <span>· {founder.role}</span>
              </h3>
              <p>{founder.bio}</p>
              <p className="about-links">
                {founder.links.map((link) => (
                  <a href={link.href} key={link.href} rel="me noopener" target="_blank">
                    {link.label}
                  </a>
                ))}
              </p>
            </article>
          ))}
          <p className="about-lede">{team.composition}</p>
        </AboutSection>

        <AboutSection id="how" title="How Claire works">
          {howItWorks.map((item) => (
            <AboutItem key={item.title} {...item} />
          ))}
        </AboutSection>

        <AboutSection id="facts" title="Key facts">
          <dl className="about-facts">
            {keyFacts.map(([term, value, href]) => (
              <div key={term}>
                <dt>{term}</dt>
                <dd>{href ? <a href={href}>{value}</a> : value}</dd>
              </div>
            ))}
          </dl>
        </AboutSection>

        <AboutSection id="faq" title="Frequently asked questions">
          {aboutFaq.map(([question, answer]) => (
            <AboutItem key={question} title={question} body={answer} />
          ))}
        </AboutSection>
      </main>
      <SiteFooter />
    </>
  );
}
