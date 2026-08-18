// SPDX-License-Identifier: Apache-2.0
import Link from 'next/link';
import { AskClaire } from '@/components/docs/ask-claire';
import { DocsSearch } from '@/components/docs/shell/DocsSearch';
import { ThemeToggle } from '@/components/docs/shell/ThemeToggle';

const links = [
  { label: 'Product', href: '/' },
  { label: 'Security', href: '/security' },
  { label: 'Developers', href: '/developers' },
  { label: 'Mockups', href: '/mockups/mobile' },
];

export function DocsHeader() {
  return (
    <header className="docs-header">
      <div className="docs-header__inner">
        <Link className="docs-header__brand" href="/docs">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand SVG */}
          <img src="/assets/brand/claire-app-icon-lime.svg" alt="" width={28} height={28} />
          <b>Claire</b>
          <span>Docs</span>
        </Link>

        <div className="docs-header__search">
          <DocsSearch />
        </div>

        <nav className="docs-header__links" aria-label="Site">
          {links.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
          <a href="https://github.com/l2succes/claire" rel="noreferrer" target="_blank">
            GitHub
          </a>
        </nav>

        <div className="docs-header__actions">
          <AskClaire />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
