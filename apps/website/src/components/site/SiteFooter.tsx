// SPDX-License-Identifier: Apache-2.0
import Link from 'next/link';
import { footerColumns } from '@/content/site';

export function SiteFooter({ note = 'All your chats. One AI.' }: { note?: string }) {
  return (
    <footer className="footer shell">
      <div className="footer-intro">
        <Link className="brand" href="/">
          <span className="brand-mark is-logo">
            <img src="/assets/brand/claire-app-icon-lime.svg" alt="" />
          </span>
          <span>claire</span>
        </Link>
        <p>{note}</p>
      </div>
      <nav className="footer-columns" aria-label="Footer">
        {footerColumns.map((column) => (
          <div className="footer-column" key={column.title}>
            <h2>{column.title}</h2>
            <ul>
              {column.links.map((item) => (
                <li key={item.href}>
                  <Link href={item.href}>{item.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <p className="footer-legal">© 2026 Claire</p>
    </footer>
  );
}
