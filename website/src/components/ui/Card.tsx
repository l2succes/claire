import type { ReactNode } from 'react';

export function Card({ children, tint = 'paper', className = '' }: { children: ReactNode; tint?: 'paper' | 'mint' | 'sky' | 'lime'; className?: string }) {
  return <article className={`card card--${tint} ${className}`}>{children}</article>;
}
