// SPDX-License-Identifier: Apache-2.0
import type { ReactNode } from 'react';
import { DocsHeader } from '@/components/docs/shell/DocsHeader';
import { DocsSidebar } from '@/components/docs/shell/DocsSidebar';
import { getNavigation } from '@/lib/docs-navigation';

/**
 * Layout frame for every documentation route: sticky header, persistent
 * section rail, and a content column that pages fill with their own
 * table of contents.
 */
export function DocsShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="docs-shell" data-wide={wide ? 'true' : undefined}>
      <DocsHeader />
      <div className="docs-shell__body">
        <DocsSidebar groups={getNavigation()} />
        <main className="docs-shell__main" id="content">
          {children}
        </main>
      </div>
    </div>
  );
}
