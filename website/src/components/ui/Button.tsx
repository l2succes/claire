import Link from 'next/link';
import type { ReactNode } from 'react';

export function Button({ href, children, tone = 'primary' }: { href: string; children: ReactNode; tone?: 'primary' | 'secondary' | 'quiet' }) {
  return <Link className={`button button--${tone}`} href={href}>{children}<span aria-hidden="true">→</span></Link>;
}
