import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PageHero } from './PageHero';

export function MarketingPage({ page }: { page: { eyebrow: string; title: string; intro: string; cards: readonly (readonly [string, string])[] } }) {
  return <main><PageHero {...page} /><section className="card-grid shell">{page.cards.map(([title, body], index) => <Card key={title} tint={index === 1 ? 'mint' : index === 2 ? 'sky' : 'paper'}><span className="card-index">0{index + 1}</span><h2>{title}</h2><p>{body}</p></Card>)}</section><section className="closing-cta shell"><p className="eyebrow">THE NEXT STEP</p><h2>One product surface. Clear operating choices.</h2><p>Explore the implementation references, choose a host, or help shape what Claire becomes.</p><div className="button-row"><Button href="/developers">Developer hub</Button><Button href="/faq" tone="secondary">Read the FAQ</Button></div></section></main>;
}
