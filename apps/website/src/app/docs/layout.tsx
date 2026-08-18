// SPDX-License-Identifier: Apache-2.0
import type { ReactNode } from 'react';
import { DocsShell } from '@/components/docs/shell/DocsShell';
import { ThemeScript } from '@/components/docs/shell/ThemeToggle';
import '@/styles/docs.css';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <ThemeScript />
      <DocsShell>{children}</DocsShell>
    </>
  );
}
