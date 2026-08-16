import Link from 'next/link';
import { footerGroups } from '@/content/site';

export function SiteFooter() {
  return <footer className="site-footer"><div className="footer-intro"><span className="wordmark"><span className="wordmark-mark">C</span><span>CLAIRE</span></span><p>All your chats. One AI. Your choice of host.</p></div><div className="footer-grid">{footerGroups.map((group) => <div key={group.title}><b>{group.title}</b>{group.links.map(([label, href]) => <Link href={href} key={href}>{label}</Link>)}</div>)}</div><div className="footer-bottom"><span>© {new Date().getFullYear()} Claire</span><span>Built in public, with honest boundaries.</span></div></footer>;
}
