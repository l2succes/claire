// SPDX-License-Identifier: Apache-2.0
import { C, Card, Cards, Doc, Mockup, P, Section, Terminal } from '@/components/docs/blocks';
import type { DocMeta } from '@/lib/docs-types';

export const meta: DocMeta = {
  title: 'Desktop development',
  description: 'Work on the macOS desktop app and the native companion.',
  section: 'build-claire',
  status: 'current',
  lastReviewed: '2026-08-15',
  order: 3,
  hero: { kind: 'mockup', surface: 'desktop', screen: 'unified-workspace', caption: 'The default desktop window' },
  related: ['/docs/build-claire/desktop-spec', '/docs/get-started/companion-app'],
};

export default function Page() {
  return (
    <Doc>
      <P lede>
        Desktop code stays under <C>desktop/macos/</C> so future platforms can be added beside it rather
        than inside it.
      </P>

      <Section id="running" title="Running the app">
        <Terminal>{`bun run dev:desktop`}</Terminal>
      </Section>

      <Section id="surfaces" title="Desktop surfaces">
        <P>
          Desktop is not a resized phone. It has a persistent workspace, a global command surface, and a
          compact companion window that behaves like a chat HUD.
        </P>
        <Mockup surface="desktop" screen="compact-chat" caption="The resizable companion window" />
        <Mockup surface="desktop" screen="ask-claire-workspace" caption="Ask Claire, reachable from anywhere with ⌥⌘A" />
      </Section>

      <Section id="deeper" title="Going deeper">
        <Cards>
          <Card
            href="/docs/build-claire/desktop-spec"
            icon="desktop"
            title="Desktop implementation specification"
            description="Architecture, native modules, and the companion supervisor."
          />
          <Card
            href="/docs/get-started/companion-app"
            icon="cloud"
            title="Desktop companion setup"
            description="The connection flows that require a computer."
          />
        </Cards>
      </Section>
    </Doc>
  );
}
