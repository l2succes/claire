// SPDX-License-Identifier: Apache-2.0
import { C, Callout, Doc, Mockup, P, Section, Terminal } from '@/components/docs/blocks';
import type { DocMeta } from '@/lib/docs-types';

export const meta: DocMeta = {
  title: 'Mobile development',
  description: 'Work on the Expo iOS, Android, and mobile web client.',
  section: 'build-claire',
  status: 'current',
  lastReviewed: '2026-08-15',
  order: 2,
  hero: { kind: 'mockup', surface: 'mobile', screen: 'chat', caption: 'Chat detail, the densest screen in the app' },
  related: ['/docs/build-claire/testing', '/docs/get-started/mock-mode', '/docs/build-claire/design-system'],
};

export default function Page() {
  return (
    <Doc>
      <P lede>
        The mobile app lives in <C>mobile/</C>. It is Expo SDK 55, React Native 0.83, and Expo Router,
        running on the new architecture (Bridgeless).
      </P>

      <Section id="running" title="Running the app">
        <Terminal>{`bun run setup
bun run dev:mobile`}</Terminal>
        <P>For a native iOS build, prebuild first so native modules are regenerated cleanly:</P>
        <Terminal cwd="mobile">{`bunx expo prebuild --clean --platform ios
bunx expo run:ios`}</Terminal>
      </Section>

      <Section id="testing" title="Mock-mode end-to-end tests">
        <Terminal cwd="mobile">{`MOCK_BRIDGE=true bunx playwright test`}</Terminal>
        <P>
          Playwright drives the mobile web build against fixture data, so the suite never touches a real
          messaging account.
        </P>
      </Section>

      <Section id="screens" title="The screens you will be changing">
        <P>
          The mockup gallery is the reference for layout and hierarchy; the built app should match it, and
          divergence is usually a bug in one of the two.
        </P>
        <Mockup surface="mobile" screen="loops" caption="Loops — commitments tracked from conversations" />
      </Section>

      <Section id="secrets" title="What not to commit">
        <Callout kind="danger" title="Environment files stay local">
          Never commit <C>mobile/.env</C>, <C>mobile/.env.local</C>, or EAS production values. They are
          gitignored for a reason and a leaked Supabase service key is not recoverable by rotation alone.
        </Callout>
      </Section>
    </Doc>
  );
}
