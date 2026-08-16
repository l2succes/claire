import { Button } from '@/components/ui/Button';

export function PageHero({ eyebrow, title, intro, primary = { label: 'Get Claire', href: '/download' }, secondary }: { eyebrow: string; title: string; intro: string; primary?: { label: string; href: string }; secondary?: { label: string; href: string } }) {
  return <section className="page-hero"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="page-hero-intro">{intro}</p><div className="button-row"><Button href={primary.href}>{primary.label}</Button>{secondary ? <Button href={secondary.href} tone="secondary">{secondary.label}</Button> : null}</div></section>;
}
