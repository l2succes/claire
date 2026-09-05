// SPDX-License-Identifier: Apache-2.0
import { C, Callout, Code, Doc, DocLink, Mockup, P, Section, Terminal } from '@/components/docs/blocks';
import type { DocMeta } from '@/lib/docs-types';

export const meta: DocMeta = {
  title: 'Plugin development',
  description: 'Create and test a local Claire plugin with fixtures.',
  section: 'extensibility',
  status: 'current',
  lastReviewed: '2026-08-15',
  order: 1,
  hero: { kind: 'mockup', surface: 'plugins', screen: 'plugin-library', caption: 'The plugin library' },
  related: ['/docs/extensibility/plugin-system', '/docs/build-claire/testing'],
};

export default function Page() {
  return (
    <Doc>
      <P lede>
        The basic plugin path uses local fixtures. You do not need Google Calendar, a task manager
        account, or any messaging login to build and test one.
      </P>

      <Section id="create" title="Create a plugin">
        <Terminal>{`bun run plugin:create my-plugin`}</Terminal>
        <P>
          This writes <C>examples/plugins/my-plugin</C> with a manifest and one dry-run action.
        </P>
      </Section>

      <Section id="run" title="Run and test it">
        <Terminal>{`bun run dev:plugin
bun run test:plugins`}</Terminal>
        <P>The calendar example creates a mock event from a fixture:</P>
        <Code lang="typescript" title="examples/plugins/calendar">{`await runPluginAction(calendarPlugin, 'calendar.events.create', {
  conversationId: 'chat_fixture',
  sourceMessageIds: ['msg_1'],
  input: { title: 'Send Maya the proposal', startsAt: '2026-08-18T15:00:00Z' },
});`}</Code>
      </Section>

      <Section id="approval" title="Where approval happens">
        <P>
          A plugin proposes; the person decides. Sensitive writes surface in an approval inbox with the
          exact data and destination shown before anything leaves Claire.
        </P>
        <Mockup surface="plugins" screen="contextual-approval" caption="Reviewing a proposed action before it is written" />
      </Section>

      <Section id="contract" title="The contract">
        <P>
          See <C>packages/plugin-sdk</C> and the <DocLink to="/docs/extensibility/plugin-system" /> for
          manifests, permissions, approvals, and risk classes.
        </P>
        <Callout kind="warning" title="Rules for v1 examples">
          <ul>
            <li>Detection is not permission.</li>
            <li>Sensitive writes require approval.</li>
            <li>No raw-message retention in fixture plugins.</li>
            <li>No real provider credentials in tests.</li>
          </ul>
        </Callout>
      </Section>
    </Doc>
  );
}
