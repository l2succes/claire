// SPDX-License-Identifier: Apache-2.0
import Link from 'next/link';
import { moreLinks, primaryNavigation } from '@/content/site';
import { HeroIcon } from '@/components/site/HeroIcon';

export function SiteHeader({ active }: { active?: string }) {
  return (
    <header className="site-header">
      <Link className="brand" href="/" aria-label="Claire home">
        <span className="brand-mark is-logo">
          <img src="/assets/brand/claire-app-icon-lime.svg" alt="" />
        </span>
        <span>claire</span>
      </Link>
      <nav className="site-nav" aria-label="Primary navigation">
        {primaryNavigation.map((item) => (
          <Link className={active === item.label ? 'active' : undefined} href={item.href} key={item.href}>
            {item.label}
          </Link>
        ))}
        <details className="site-nav-more">
          <summary>
            More <HeroIcon name="chevron-down" className="size-3.5" />
          </summary>
          <div className="site-nav-popover">
            {moreLinks.map((item) => (
              <Link href={item.href} key={item.href}>
                <b>{item.title}</b>
                <span>{item.body}</span>
              </Link>
            ))}
          </div>
        </details>
      </nav>
      <details className="mobile-nav">
        <summary>
          Menu <HeroIcon name="bars-3" />
        </summary>
        <nav aria-label="Mobile navigation">
          {primaryNavigation.map((item) => (
            <Link href={item.href} key={`mobile-${item.href}`}>
              {item.label}
            </Link>
          ))}
          {moreLinks.map((item) => (
            <Link href={item.href} key={`mobile-${item.href}`}>
              {item.title}
            </Link>
          ))}
          <Link href="/#waitlist">Join the waitlist</Link>
        </nav>
      </details>
      <Link className="button button-dark button-small" href="/#waitlist">
        Join the waitlist
      </Link>
    </header>
  );
}
