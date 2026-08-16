// SPDX-License-Identifier: Apache-2.0
import Link from 'next/link';
import { footerLinks } from '@/content/site';

export function SiteFooter({ note = 'All your chats. One AI.' }: { note?: string }) {
  return (
    <footer className="footer shell">
      <Link className="brand" href="/">
        <span className="brand-mark is-logo">
          <img src="/assets/brand/claire-kept-thread-flipped.svg" alt="" />
        </span>
        <span>claire</span>
      </Link>
      <p>{note}</p>
      <div>
        {footerLinks.map((item) => (
          <Link href={item.href} key={item.href}>
            {item.label}
          </Link>
        ))}
        <span>© 2026 Claire</span>
      </div>
    </footer>
  );
}
