// SPDX-License-Identifier: Apache-2.0
import { C, Callout, Code, Doc, Facts, P, Section, Table, Terminal } from '@/components/docs/blocks';
import type { DocMeta } from '@/lib/docs-types';

export const meta: DocMeta = {
  title: 'Mock bridge mode',
  description: 'Run Claire without real messaging accounts for safe local development and tests.',
  section: 'get-started',
  status: 'current',
  lastReviewed: '2026-08-17',
  order: 3,
  hero: { kind: 'mockup', surface: 'mobile', screen: 'unified-inbox', caption: 'The inbox, filled with fixture conversations' },
  related: ['/docs/get-started/quickstart', '/docs/build-claire/testing', '/docs/build-claire/architecture'],
};

export default function Page() {
  return (
    <Doc>
      <P lede>
        <C>MOCK_BRIDGE=true</C> boots the server with zero external dependencies — no Docker, no Supabase,
        no WhatsApp, Matrix, Telegram, or Instagram. A <C>MockBridgeAdapter</C> replaces every real
        platform adapter and emits deterministic fixture messages.
      </P>

      <Section id="usage" title="Usage">
        <Terminal cwd="server">{`MOCK_BRIDGE=true bun run src/index.ts`}</Terminal>
        <P>
          Or set <C>MOCK_BRIDGE=true</C> in <C>.env</C>.
        </P>
      </Section>

      <Section id="fixtures" title="Fixture inventory">
        <Facts
          items={[
            { label: 'User', value: <C>00000000-0000-0000-0000-000000000001</C> },
            { label: 'Platforms', value: '3 — WhatsApp, Telegram, Instagram' },
            { label: 'Chats', value: '4 — three individual, one WhatsApp group' },
            { label: 'Messages', value: '10' },
            { label: 'Promise-bearing', value: '1' },
          ]}
        />

        <Table
          head={['Chat ID', 'Platform', 'Name']}
          rows={[
            [<C key="a">mock-chat-wa-alice</C>, 'WhatsApp', 'Alice (WA)'],
            [<C key="b">mock-chat-tg-bob</C>, 'Telegram', 'Bob (TG)'],
            [<C key="c">mock-chat-ig-carol</C>, 'Instagram', 'Carol (IG)'],
            [<C key="d">mock-chat-wa-group</C>, 'WhatsApp', 'Team Chat (group)'],
          ]}
        />
      </Section>

      <Section id="promise" title="The promise message">
        <Code lang="text" title="Fixture" copy={false}>{`I'll send you the report by Friday`}</Code>
        <P>
          Sent by the user (<C>isFromMe=true</C>) in the WhatsApp/Alice chat. The promise detector should
          flag it as a <C>commitment</C> with the deadline <C>Friday</C>. It exists so promise detection
          has a stable target to assert against.
        </P>
      </Section>

      <Section id="seed" title="Seed and reset endpoints">
        <P>
          These routes exist only when <C>MOCK_BRIDGE=true</C>.
        </P>
        <Table
          head={['Route', 'Effect']}
          rows={[
            [<C key="a">GET /seed/fixtures</C>, 'Fixture counts and IDs, for test assertions'],
            [<C key="b">POST /seed/reset</C>, 'Truncate mock-user rows and replay the fixture messages'],
          ]}
        />
        <Callout kind="tip">
          Call <C>POST /seed/reset</C> at the start of each Playwright test so every test begins from the
          same known state.
        </Callout>
      </Section>

      <Section id="how-it-works" title="How it works">
        <ol>
          <li>
            <C>server/src/config/index.ts</C> parses the <C>MOCK_BRIDGE</C> environment variable.
          </li>
          <li>
            When <C>mockBridgeConfig.enabled</C>, <C>server/src/index.ts</C> calls{' '}
            <C>platformManager.setMatrixMode(mockBridgeAdapter)</C> instead of wiring any real adapter.
          </li>
          <li>
            <C>MockBridgeAdapter.initialize()</C> emits <C>MOCK_MESSAGES</C> as <C>message</C> events via{' '}
            <C>setImmediate</C>, so the normal unified message handler processes them end to end.
          </li>
          <li>The seed route truncates and replays those messages for test isolation.</li>
        </ol>
        <P>
          The important property is that mock mode exercises the <em>real</em> message pipeline. Only the
          source of events is faked.
        </P>
      </Section>
    </Doc>
  );
}
