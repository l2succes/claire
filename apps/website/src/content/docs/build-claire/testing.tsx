// SPDX-License-Identifier: Apache-2.0
import { C, Doc, P, Section, Table, Terminal } from '@/components/docs/blocks';
import type { DocMeta } from '@/lib/docs-types';

export const meta: DocMeta = {
  title: 'Testing',
  description: 'Unit, plugin fixture, lint, typecheck, and Storybook checks.',
  section: 'build-claire',
  status: 'current',
  lastReviewed: '2026-08-15',
  order: 5,
  related: ['/docs/build-claire/e2e-selectors', '/docs/get-started/mock-mode'],
};

export default function Page() {
  return (
    <Doc>
      <P lede>
        Every check runs from the repository root and needs nothing beyond Bun. None of them touch a real
        messaging account or a real provider.
      </P>

      <Section id="commands" title="The checks">
        <Terminal>{`bun run test
bun run test:plugins
bun run lint
bun run typecheck
bun run check
bun run storybook`}</Terminal>
      </Section>

      <Section id="runners" title="Which runner does what">
        <Table
          head={['Area', 'Runner', 'Notes']}
          rows={[
            ['Server', <C key="a">bun test</C>, 'Bun’s own runner, with bun:test mocks.'],
            ['Mobile unit', <C key="b">bunx jest</C>, 'Jest — bun test cannot parse React Native’s Flow syntax.'],
            ['Mobile web e2e', 'Playwright', <span key="c">Runs against <C>MOCK_BRIDGE=true</C>.</span>],
            ['Plugins', <C key="d">bun test</C>, 'Local fixtures only; must never call a real provider.'],
          ]}
        />
      </Section>
    </Doc>
  );
}
