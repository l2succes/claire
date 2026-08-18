// SPDX-License-Identifier: Apache-2.0
import { C, Callout, Doc, P, Section, Table, Terminal } from '@/components/docs/blocks';
import type { DocMeta } from '@/lib/docs-types';

export const meta: DocMeta = {
  title: 'Production setup',
  description: 'Public checklist for deploying Claire without exposing live infrastructure details.',
  section: 'deploy-operate',
  status: 'current',
  lastReviewed: '2026-08-17',
  order: 2,
  related: ['/docs/deploy-operate/self-hosting', '/docs/deploy-operate/railway', '/docs/deploy-operate/schema-verification'],
};

export default function Page() {
  return (
    <Doc>
      <P lede>
        This is the public checklist for deploying Claire. Live hostnames, project IDs, database proxies,
        and operator runbooks belong in a private operations repository, not in this tree.
      </P>

      <Section id="services" title="Required services">
        <ul>
          <li>
            The Claire API (<C>server/</C>)
          </li>
          <li>Postgres, Auth, and Realtime — self-hosted Supabase or a managed project</li>
          <li>Redis</li>
          <li>
            Optional: Matrix (Synapse plus mautrix bridges) when <C>PLATFORM_MODE=matrix</C>
          </li>
        </ul>
      </Section>

      <Section id="server-env" title="Server environment">
        <P>
          Copy <C>.env.production.example</C> and <C>server/.env.example</C>, then set real values in your
          host&rsquo;s secret store.
        </P>
        <Table
          head={['Variable', 'Purpose']}
          rows={[
            [<C key="a">SUPABASE_URL</C>, 'API gateway for Auth, PostgREST, and Realtime'],
            [<C key="b">SUPABASE_ANON_KEY</C>, 'Public anon key'],
            [<C key="c">SUPABASE_SERVICE_KEY</C>, 'Server-only service-role key'],
            [<C key="d">DATABASE_URL</C>, 'Postgres connection string'],
            [<C key="e">JWT_SECRET</C>, 'Session signing secret'],
            [<C key="f">ENCRYPTION_KEY</C>, 'Token encryption at rest'],
            [<C key="g">OPENAI_API_KEY</C>, 'Optional; mock mode does not need it'],
            [<C key="h">PLATFORM_MODE</C>, 'matrix or direct — must be explicit in production'],
            [<C key="i">REDIS_URL</C>, 'Queue and session cache'],
          ]}
        />
      </Section>

      <Section id="mobile-env" title="Mobile environment">
        <P>Stored in EAS or a local, never-committed `.env.production`.</P>
        <Table
          head={['Variable', 'Purpose']}
          rows={[
            [<C key="a">EXPO_PUBLIC_SUPABASE_URL</C>, 'The gateway the app itself can reach'],
            [<C key="b">EXPO_PUBLIC_SUPABASE_ANON_KEY</C>, 'Public anon key'],
            [<C key="c">EXPO_PUBLIC_API_URL</C>, 'Public Claire API origin'],
            [<C key="d">EXPO_PUBLIC_ENV</C>, <C key="e">production</C>],
          ]}
        />
        <P>Store them in EAS so CI machines never need a local file:</P>
        <Terminal cwd="mobile">{`bunx eas env:create --scope project --environment production \\
  --name EXPO_PUBLIC_SUPABASE_URL \\
  --value "$EXPO_PUBLIC_SUPABASE_URL" \\
  --type plain`}</Terminal>
        <P>
          Repeat for the rest, then pull on a new machine with{' '}
          <C>bunx eas env:pull --environment production</C>.
        </P>
      </Section>

      <Section id="health" title="Health checks">
        <Terminal>{`curl https://<claire-api-host>/health

curl https://<supabase-kong-host>/auth/v1/health \\
  -H "apikey: $EXPO_PUBLIC_SUPABASE_ANON_KEY"`}</Terminal>
      </Section>

      <Section id="builds" title="Builds">
        <Terminal cwd="mobile">{`bunx eas build --profile preview --platform ios
bunx eas build --profile production --platform ios`}</Terminal>
      </Section>

      <Section id="operator-notes" title="Operator notes">
        <Callout kind="danger" title="Treat any leaked value as exposed">
          Database passwords, project IDs, proxy hosts, and incident runbooks stay in private ops docs. If
          you find a live credential or hostname anywhere in this repository, rotate it and open a
          security issue — do not simply delete the line.
        </Callout>
      </Section>
    </Doc>
  );
}
