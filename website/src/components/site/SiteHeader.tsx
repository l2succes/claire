import Link from 'next/link';
import { primaryNavigation } from '@/content/site';

export function SiteHeader() {
  return <header className="site-header"><Link className="wordmark" href="/" aria-label="Claire home"><span className="wordmark-mark">C</span><span>CLAIRE</span></Link><nav aria-label="Primary navigation">{primaryNavigation.map((item) => <Link href={item.href} key={item.href}>{item.label}</Link>)}</nav><Link className="header-cta" href="/download">Get Claire <span aria-hidden="true">↗</span></Link></header>;
}
