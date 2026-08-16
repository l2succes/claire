import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { PageHero } from '@/components/site/PageHero';
import { developerTracks } from '@/content/site';

export default function DevelopersPage() {
  return <main><PageHero eyebrow="CLAIRE DEVELOPERS" title="One reference for the product we are building together." intro="Design foundations, application mockups, plugin contracts, architecture decisions, and contribution paths—organized as a real documentation site." primary={{ label: 'Browse components', href: '/developers/components' }} secondary={{ label: 'Get started', href: '/developers/docs/getting-started' }} /><section className="reference-grid shell">{developerTracks.map(({ icon: Icon, title, body, href }, index) => <Link href={href} key={title}><Card tint={index % 3 === 1 ? 'mint' : index % 3 === 2 ? 'sky' : 'paper'}><Icon className="feature-icon" /><Badge tone={index < 4 ? 'lime' : 'neutral'}>{index < 4 ? 'Visual reference' : 'Documentation'}</Badge><h2>{title}</h2><p>{body}</p><span className="card-link">Open reference →</span></Card></Link>)}</section><section className="community-banner shell"><div><p className="eyebrow">THE COMMUNITY MODEL</p><h2>Open participation, sustainable hosting.</h2></div><p>Developers can improve Claire, build plugins, and operate compatible deployments. Claire Cloud funds the managed infrastructure, support, AI allowances, and additional services that make the product easy to adopt.</p></section></main>;
}
