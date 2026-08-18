// SPDX-License-Identifier: Apache-2.0
import { C, Callout, Doc, P, Section, Table } from '@/components/docs/blocks';
import type { DocMeta } from '@/lib/docs-types';

export const meta: DocMeta = {
  title: 'Environment variables',
  description: 'Public reference for Claire’s environment variables. No live values.',
  section: 'deploy-operate',
  status: 'current',
  lastReviewed: '2026-08-15',
  order: 4,
  related: ['/docs/get-started/environment', '/docs/deploy-operate/self-hosting'],
};

export default function Page() {
  return (
    <Doc>
      <P lede>
        Copy the example files and set your own values. This page lists which variables exist and what
        they are for — it never contains a real value.
      </P>

      <Section id="server" title="Server">
        <P>
          See <C>server/.env.example</C>. A real (non-mock) stack requires:
        </P>
        <Table
          head={['Variable', 'Purpose']}
          rows={[
            [<C key="a">SUPABASE_URL</C>, 'Origin of your Supabase gateway.'],
            [<C key="b">SUPABASE_ANON_KEY</C>, 'Public client key.'],
            [<C key="c">SUPABASE_SERVICE_KEY</C>, 'Server-side key. Never ship this to a client.'],
            [<C key="d">DATABASE_URL</C>, 'Direct Postgres connection string.'],
            [<C key="e">JWT_SECRET</C>, 'Signs Claire session tokens.'],
            [<C key="f">ENCRYPTION_KEY</C>, 'Encrypts stored platform session material.'],
          ]}
        />
        <P>Matrix mode additionally needs:</P>
        <Table
          head={['Variable', 'Purpose']}
          rows={[
            [<C key="a">MATRIX_HOMESERVER_URL</C>, 'Synapse origin.'],
            [<C key="b">MATRIX_SERVER_NAME</C>, 'The server name in user IDs, e.g. claire.local.'],
            [<C key="c">MATRIX_ADMIN_TOKEN</C>, 'Admin access token used to provision users and rooms.'],
          ]}
        />
      </Section>

      <Section id="mobile" title="Mobile">
        <P>
          See <C>mobile/.env.example</C>. Everything prefixed <C>EXPO_PUBLIC_</C> is embedded in the app
          bundle and is therefore public by construction — never put a secret behind that prefix.
        </P>
        <Table
          head={['Variable', 'Purpose']}
          rows={[
            [<C key="a">EXPO_PUBLIC_SUPABASE_URL</C>, 'Supabase origin the client talks to.'],
            [<C key="b">EXPO_PUBLIC_SUPABASE_ANON_KEY</C>, 'Public anon key.'],
            [<C key="c">EXPO_PUBLIC_API_URL</C>, 'Claire API origin.'],
          ]}
        />
      </Section>

      <Section id="website" title="Website and Ask Claire">
        <Table
          head={['Variable', 'Purpose']}
          rows={[
            [<C key="a">OPENAI_API_KEY</C>, 'Enables POST /api/docs/ask. Without it the route falls back to search.'],
            [<C key="b">CLAIRE_DOCS_ASK_MODEL</C>, 'Defaults to gpt-5.4-mini.'],
            [<C key="c">CLAIRE_DOCS_ASK_MONTHLY_BUDGET_USD</C>, 'Defaults to 50.'],
          ]}
        />
        <Callout kind="note">
          Ask Claire hashes questions for caching and does not persist raw queries.
        </Callout>
      </Section>
    </Doc>
  );
}
