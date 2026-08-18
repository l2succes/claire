// SPDX-License-Identifier: Apache-2.0
'use client';

import { Children, useId, useState, type ReactNode } from 'react';

export function Tabs({ items, children }: { items: string[]; children: ReactNode }) {
  const [active, setActive] = useState(0);
  const id = useId().replaceAll(':', '');
  const panels = Children.toArray(children);

  return (
    <div className="doc-tabs">
      <div className="doc-tabs__list" role="tablist" data-noindex="">
        {items.map((item, index) => (
          <button
            key={item}
            id={`${id}-tab-${index}`}
            role="tab"
            type="button"
            aria-selected={index === active}
            aria-controls={`${id}-panel-${index}`}
            tabIndex={index === active ? 0 : -1}
            onClick={() => setActive(index)}
          >
            {item}
          </button>
        ))}
      </div>
      {panels.map((panel, index) => (
        <div
          key={index}
          id={`${id}-panel-${index}`}
          role="tabpanel"
          aria-labelledby={`${id}-tab-${index}`}
          hidden={index !== active}
          className="doc-tabs__panel"
          data-tab-label={items[index]}
        >
          {panel}
        </div>
      ))}
    </div>
  );
}

export function Tab({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
