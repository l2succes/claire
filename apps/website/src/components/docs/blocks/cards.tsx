// SPDX-License-Identifier: Apache-2.0
import type { ReactNode } from 'react';
import { HeroIcon, type HeroIconName } from '@/components/site/HeroIcon';

export function Cards({ children, columns = 2 }: { children: ReactNode; columns?: 1 | 2 | 3 }) {
  return (
    <div className="doc-cards" data-columns={columns}>
      {children}
    </div>
  );
}

export function Card({
  href,
  title,
  description,
  icon,
  eyebrow,
}: {
  href: string;
  title: string;
  description?: string;
  icon?: HeroIconName;
  eyebrow?: string;
}) {
  const external = /^https?:/.test(href);
  const inner = (
    <>
      {icon ? <HeroIcon name={icon} size="sm" className="doc-card__icon" /> : null}
      {eyebrow ? <span className="doc-card__eyebrow">{eyebrow}</span> : null}
      <span className="doc-card__title">
        {title}
        {external ? <HeroIcon name="external" size="sm" className="doc-card__external" /> : null}
      </span>
      {description ? <span className="doc-card__description">{description}</span> : null}
    </>
  );

  if (external) {
    return (
      <a className="doc-card" href={href} rel="noreferrer" target="_blank">
        {inner}
      </a>
    );
  }
  return (
    <a className="doc-card" href={href}>
      {inner}
    </a>
  );
}
