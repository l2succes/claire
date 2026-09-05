// SPDX-License-Identifier: Apache-2.0
import { C, Callout, Card, Cards, Doc, P, Section, Step, Steps, Terminal } from '@/components/docs/blocks';
import type { DocMeta } from '@/lib/docs-types';

export const meta: DocMeta = {
  title: 'Self-hosting',
  description: 'Run Claire on your own infrastructure without publishing operator secrets.',
  section: 'deploy-operate',
  status: 'current',
  lastReviewed: '2026-08-15',
  order: 1,
  related: ['/docs/deploy-operate/production-setup', '/docs/deploy-operate/railway', '/docs/deploy-operate/environment-reference'],
};

export default function Page() {
  return (
    <Doc>
      <P lede>
        Claire is designed to be self-hostable end to end: the API, Postgres, Redis, the Matrix homeserver,
        and the bridges all run from this repository&rsquo;s compose files.
      </P>

      <Section id="steps" title="The short version">
        <Steps>
          <Step title="Create your environment file">
            <P>
              Copy <C>server/.env.example</C> and set your own values. Nothing in this repository contains
              working credentials.
            </P>
          </Step>
          <Step title="Start the stacks">
            <Terminal>{`bun run docker:up`}</Terminal>
            <P>Or run the compose files directly if you are deploying them to separate hosts.</P>
          </Step>
          <Step title="Apply the database migrations">
            <P>
              Everything in <C>supabase/migrations/</C>, in filename order.
            </P>
          </Step>
          <Step title="Point the clients at your API origin">
            <P>Mobile and desktop read the origin from their environment; nothing is hardcoded.</P>
          </Step>
        </Steps>
      </Section>

      <Section id="openness" title="What the public docs deliberately omit">
        <Callout kind="note" title="No live infrastructure details">
          These docs describe how to run Claire, not how Claire&rsquo;s own production runs. Live
          hostnames, credentials, recovery paths, anti-abuse controls, and incident detail stay private —
          publishing them raises operational risk without helping anyone self-host.
        </Callout>
      </Section>

      <Section id="next" title="Then go deeper">
        <Cards>
          <Card
            href="/docs/deploy-operate/production-setup"
            icon="server"
            title="Production setup"
            description="Hardening, migrations, and the checks worth running before you take traffic."
          />
          <Card
            href="/docs/deploy-operate/railway"
            icon="cloud"
            title="Deploy to Railway"
            description="A worked example of a managed deployment."
          />
        </Cards>
      </Section>
    </Doc>
  );
}
