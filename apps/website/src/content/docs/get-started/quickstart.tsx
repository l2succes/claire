// SPDX-License-Identifier: Apache-2.0
import { C, Callout, Code, Doc, P, Section, Step, Steps, Table, Terminal } from '@/components/docs/blocks';
import type { DocMeta } from '@/lib/docs-types';

export const meta: DocMeta = {
  title: 'Repository setup',
  description: 'Clone Claire and start mock mode without any third-party accounts.',
  section: 'get-started',
  status: 'current',
  lastReviewed: '2026-08-15',
  order: 1,
  hero: { kind: 'mockup', surface: 'mobile', screen: 'daily-brief', caption: 'What you get after `bun run dev`' },
  related: ['/docs/get-started/mock-mode', '/docs/get-started/environment', '/docs/build-claire/architecture'],
};

export default function Page() {
  return (
    <Doc>
      <P lede>
        Claire&rsquo;s default contributor path does not require WhatsApp, Telegram, Instagram, Matrix,
        Supabase Cloud, or a paid AI key. Mock mode gives you the whole product surface with fixture data.
      </P>

      <Section id="prerequisites" title="Prerequisites">
        <ul>
          <li>macOS, Linux, or Windows with WSL2</li>
          <li>
            <a href="https://bun.sh" rel="noreferrer" target="_blank">
              Bun
            </a>{' '}
            1.1 or newer
          </li>
          <li>Docker and Docker Compose — only for the optional real local stack</li>
          <li>Xcode (iOS) or Android Studio — optional</li>
        </ul>
        <Terminal>{`bun --version
docker --version`}</Terminal>
      </Section>

      <Section id="setup" title="Set up the workspace">
        <Steps>
          <Step title="Clone the repository">
            <Terminal>{`git clone https://github.com/l2succes/claire.git
cd claire`}</Terminal>
            <P>
              The mautrix documentation submodule is optional. Initialize it only if you are working on
              bridges.
            </P>
            <Terminal>{`git submodule update --init vendor/mautrix-docs`}</Terminal>
          </Step>

          <Step title="Create environment files">
            <P>
              <C>bun run setup</C> copies the example env files if they are missing. It never writes
              production credentials.
            </P>
            <Terminal>{`bun run setup`}</Terminal>
          </Step>

          <Step title="Start in mock mode">
            <P>This starts the API and the Expo mobile and web clients against deterministic fixtures.</P>
            <Terminal>{`bun run dev`}</Terminal>
            <Callout kind="tip">
              Set <C>MOCK_BRIDGE=true</C> explicitly when running Playwright tests, so a stray real
              credential in your environment cannot leak into a test run.
            </Callout>
          </Step>

          <Step title="Run the checks">
            <Terminal>{`bun run test
bun run lint
bun run typecheck
bun run storybook
bun run test:plugins`}</Terminal>
          </Step>
        </Steps>
      </Section>

      <Section id="repository-map" title="Repository map">
        <Code lang="text" title="Top-level layout" copy={false}>{`mobile/     Expo iOS, Android, and mobile web
desktop/    Desktop apps (macos/ today)
website/    Marketing site, docs, Storybook
server/     Bun API
packages/   design-system, platform-catalog, plugin-sdk
examples/   Local plugin fixtures
docker/     Local Supabase and Matrix
supabase/   Migrations
vendor/     Optional upstream docs`}</Code>
      </Section>

      <Section id="tracks" title="Contribution tracks">
        <P>Pick the command that matches what you came to change.</P>
        <Table
          head={['Track', 'Command']}
          rows={[
            ['Website and docs', <C key="w">bun run dev:website</C>],
            ['Mobile', <C key="m">bun run dev:mobile</C>],
            ['Desktop', <C key="d">bun run dev:desktop</C>],
            ['Server', <C key="s">bun run dev:server</C>],
            ['Plugins', <C key="p">bun run plugin:create my-plugin</C>],
            ['Connectors', <C key="c">edit packages/platform-catalog, then bun run catalog:generate</C>],
          ]}
        />
      </Section>
    </Doc>
  );
}
