// SPDX-License-Identifier: Apache-2.0
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { HeroIcon } from '@/components/site/HeroIcon';
import type { NavGroup } from '@/lib/docs-navigation';

export function DocsSidebar({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [drawer, setDrawer] = useState(false);

  const activeSection = useMemo(
    () => groups.find((group) => group.items.some((item) => item.url === pathname))?.section,
    [groups, pathname],
  );

  // The section containing the current page is always expanded; anything the
  // reader has toggled themselves wins over that default.
  const isOpen = (section: string) => open[section] ?? section === activeSection;

  useEffect(() => {
    document.body.classList.toggle('docs-drawer-open', drawer);
    return () => document.body.classList.remove('docs-drawer-open');
  }, [drawer]);

  return (
    <>
      <button className="docs-sidebar__trigger" type="button" onClick={() => setDrawer(true)}>
        <HeroIcon name="bars-3" size="sm" />
        <span>Browse docs</span>
      </button>

      {drawer ? (
        <button
          className="docs-sidebar__scrim"
          type="button"
          aria-label="Close navigation"
          onClick={() => setDrawer(false)}
        />
      ) : null}

      {/* Closing on any link click, rather than on a pathname effect, keeps the
          drawer in sync without a render cascade — and also handles a click on
          the link for the page you are already on. */}
      <nav
        className="docs-sidebar"
        data-drawer={drawer ? 'open' : undefined}
        aria-label="Documentation"
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('a')) setDrawer(false);
        }}
      >
        <div className="docs-sidebar__inner">
          <Link className="docs-sidebar__home" href="/docs" data-active={pathname === '/docs' || undefined}>
            <HeroIcon name="home" size="sm" />
            Overview
          </Link>
          <Link className="docs-sidebar__home" href="/docs/all" data-active={pathname === '/docs/all' || undefined}>
            <HeroIcon name="search" size="sm" />
            All documents
          </Link>

          {groups.map((group) => {
            const expanded = isOpen(group.section);
            return (
              <section className="docs-sidebar__group" key={group.section}>
                <button
                  type="button"
                  className="docs-sidebar__group-title"
                  aria-expanded={expanded}
                  onClick={() => setOpen((current) => ({ ...current, [group.section]: !expanded }))}
                >
                  <HeroIcon name={group.icon} size="sm" />
                  <span>{group.label}</span>
                  <HeroIcon name="chevron-down" size="sm" className="docs-sidebar__chevron" />
                </button>
                {expanded ? (
                  <ul>
                    {group.items.map((item) => (
                      <li key={item.url}>
                        <Link href={item.url} data-active={pathname === item.url || undefined}>
                          <span>{item.title}</span>
                          {item.status !== 'current' ? (
                            <em data-status={item.status}>{item.status}</em>
                          ) : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            );
          })}
        </div>
      </nav>
    </>
  );
}
