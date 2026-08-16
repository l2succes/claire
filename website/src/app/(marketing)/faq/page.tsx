// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from 'next';
import { faqGroups } from '@/content/site';
import { PageHero } from '@/components/site/PageHero';
import { SiteFooter } from '@/components/site/SiteFooter';
import { SiteHeader } from '@/components/site/SiteHeader';

export const metadata: Metadata = {
  title: 'FAQ',
  description: 'Answers about Claire’s product, hosting, AI, and contributor path.',
};

export default function FaqPage() {
  return (
    <>
      <SiteHeader />
      <main className="shell faq-page">
        <PageHero
          eyebrow="QUESTIONS"
          title="Straight answers."
          highlight="No hidden mode."
          intro="Claire is alpha. These answers separate what works today from what is still on the roadmap."
          primary={{ href: '/docs', label: 'Read the docs' }}
          secondary={{ href: '/security', label: 'Security details' }}
        />
        {faqGroups.map((group) => (
          <section className="faq-group" key={group.title}>
            <h2>{group.title}</h2>
            <div>
              {group.items.map(([question, answer]) => (
                <details key={question}>
                  <summary>
                    {question}
                    <span>+</span>
                  </summary>
                  <p>{answer}</p>
                </details>
              ))}
            </div>
          </section>
        ))}
      </main>
      <SiteFooter />
    </>
  );
}
