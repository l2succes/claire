// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from 'next';
import { DocsCatalog, type CatalogEntry } from '@/components/docs/docs-catalog';
import { getDocs } from '@/lib/docs';

export const metadata: Metadata = {
  title: 'All documentation',
  description: 'Search and filter every published Claire document by purpose and lifecycle status.',
};

export default function Page() {
  // The component is a client island, so pass plain data — `Component` on each
  // catalog entry is a React component and cannot cross the boundary.
  const docs: CatalogEntry[] = getDocs().map((doc) => ({
    title: doc.title,
    url: doc.url,
    description: doc.description,
    section: doc.section,
    status: doc.status,
    lastReviewed: doc.lastReviewed,
    roadmapStatus: doc.roadmap?.status,
  }));

  return <DocsCatalog docs={docs} />;
}
