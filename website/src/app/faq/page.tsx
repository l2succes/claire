import { PageHero } from '@/components/site/PageHero';
import { faqGroups } from '@/content/faq';

export default function FAQPage() {
  return <main><PageHero eyebrow="FAQ" title="Straight answers about Claire." intro="What works, what is planned, where data goes, and how developers can participate." secondary={{ label: 'Developer hub', href: '/developers' }} /><section className="faq shell">{faqGroups.map((group) => <div className="faq-group" key={group.title}><h2>{group.title}</h2><div>{group.items.map(([question, answer]) => <details key={question}><summary>{question}<span>+</span></summary><p>{answer}</p></details>)}</div></div>)}</section></main>;
}
