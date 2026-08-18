// SPDX-License-Identifier: Apache-2.0
import { C, Code, Doc, P, Section } from '@/components/docs/blocks';
import type { DocMeta } from '@/lib/docs-types';

export const meta: DocMeta = {
  title: 'Close your loops campaign',
  description: 'Preview and edit the interactive campaign concept for Claire’s Loops tab.',
  section: 'plans',
  status: 'current',
  lastReviewed: '2026-08-17',
  order: 2,
  related: ['/docs/product/roadmap', '/docs/build-claire/design-system'],
};

export default function Page() {
  return (
    <Doc>
      <P lede>
        The Close your loops campaign is an interactive creative concept for the Loops tab: everyday
        moments Claire can keep from slipping, followed by the product response that closes the
        loop.
      </P>

      <Section id="open-the-campaign" title="Open the campaign">
        <P>
          From the repository root, start the dependency-free landing preview and open the campaign
          route directly:
        </P>
        <Code lang="bash" title="Local preview">{`bun run landing
# http://localhost:3000/close-the-loop.html`}</Code>
        <P>
          You can also start at the landing page and choose <b>Explore → Campaign concept</b>. The
          direct route is useful when reviewing the storyboard, the mobile creative, or the vertical
          Reel cutdown.
        </P>
      </Section>

      <Section id="source" title="Source and scope">
        <P>
          The page lives in <C>landing/close-the-loop.html</C>, with its visual system in{' '}
          <C>landing/close-the-loop.css</C> and interaction logic in{' '}
          <C>landing/close-the-loop.js</C>. It is a campaign concept, not a claim that these
          automated actions are already shipping.
        </P>
      </Section>
    </Doc>
  );
}
