// SPDX-License-Identifier: Apache-2.0
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { HeroIcon } from '@/components/site/HeroIcon';

export function PageHero({
  eyebrow,
  title,
  highlight,
  intro,
  primary,
  secondary,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  highlight?: string;
  intro?: string;
  primary?: { href: string; label: string };
  secondary?: { href: string; label: string };
  children?: ReactNode;
}) {
  return (
    <section className="hero shell">
      <div className="eyebrow">
        <span className="status-dot" />
        {eyebrow}
      </div>
      <h1 className="marketing-title">
        {title}
        {highlight ? (
          <>
            <br />
            <span className="claire-underline">{highlight}</span>
          </>
        ) : null}
      </h1>
      {intro ? <p className="hero-copy">{intro}</p> : null}
      {primary || secondary ? (
        <div className="hero-actions">
          {primary ? (
            <Button href={primary.href}>
              {primary.label} <HeroIcon name="arrow-right" className="size-4" />
            </Button>
          ) : null}
          {secondary ? (
            <Button href={secondary.href} variant="quiet" className="text-link">
              {secondary.label} <HeroIcon name="arrow-right" className="size-4" />
            </Button>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
