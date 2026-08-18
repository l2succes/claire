// SPDX-License-Identifier: Apache-2.0
import { C, Callout, Doc, P, Section, Step, Steps, Terminal } from '@/components/docs/blocks';
import type { DocMeta } from '@/lib/docs-types';

export const meta: DocMeta = {
  title: 'Contribution workflow',
  description: 'Branching, DCO sign-off, checks, and review.',
  section: 'contribute',
  status: 'current',
  lastReviewed: '2026-08-15',
  order: 1,
  related: ['/docs/build-claire/testing', '/docs/get-started/quickstart'],
};

export default function Page() {
  return (
    <Doc>
      <P lede>
        Claire is developed in public. The workflow is deliberately ordinary — the only unusual
        requirement is the DCO sign-off on every commit.
      </P>

      <Section id="steps" title="The workflow">
        <Steps>
          <Step title="Branch from an updated main" />
          <Step title="Sign every commit">
            <Terminal>{`git commit -s -m "your message"`}</Terminal>
            <P>
              The <C>-s</C> flag adds the Developer Certificate of Origin trailer. CI rejects commits
              without it.
            </P>
          </Step>
          <Step title="Keep the change focused">
            <P>One concern per pull request. Unrelated cleanups belong in their own branch.</P>
          </Step>
          <Step title="Run the checks">
            <Terminal>{`bun run check`}</Terminal>
          </Step>
          <Step title="Open a pull request with the template" />
        </Steps>
      </Section>

      <Section id="secrets" title="What never goes in a commit">
        <Callout kind="danger" title="No secrets, no production hostnames">
          Public documentation and code must not contain live hostnames, credentials, or recovery paths.
          See{' '}
          <a href="https://github.com/l2succes/claire/blob/main/SECURITY.md" rel="noreferrer" target="_blank">
            SECURITY.md
          </a>{' '}
          and{' '}
          <a href="https://github.com/l2succes/claire/blob/main/CONTRIBUTING.md" rel="noreferrer" target="_blank">
            CONTRIBUTING.md
          </a>
          .
        </Callout>
      </Section>
    </Doc>
  );
}
