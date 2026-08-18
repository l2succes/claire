// SPDX-License-Identifier: Apache-2.0
import { Doc, P, Roadmap, Section } from '@/components/docs/blocks';
import type { DocMeta } from '@/lib/docs-types';

export const meta: DocMeta = {
  title: 'Product roadmap',
  description: 'What is available, what is being worked on, what is planned, and what is still research.',
  section: 'product',
  status: 'current',
  lastReviewed: '2026-08-15',
  order: 1,
  related: ['/docs/product/connectors', '/docs/product/security'],
};

export default function Page() {
  return (
    <Doc>
      <P lede>
        Claire is alpha. This board separates what is available, what is actively being worked on, what
        is planned, and what is still under research.
      </P>
      <P>
        It is assembled from the metadata of the published documentation, and connector availability
        comes from the shared product catalog — so a card cannot appear here without a document behind
        it, and the connector list cannot claim support the product does not have.
      </P>

      <Section id="board" title="The board">
        <Roadmap />
      </Section>
    </Doc>
  );
}
