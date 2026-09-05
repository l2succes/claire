// SPDX-License-Identifier: Apache-2.0
import { C, Callout, Doc, P, Section, Tab, Tabs, Terminal } from '@/components/docs/blocks';
import type { DocMeta } from '@/lib/docs-types';

export const meta: DocMeta = {
  title: 'Deploying the database',
  description: 'Safely apply Claire schema changes and reload the API schema cache.',
  section: 'deploy-operate',
  status: 'current',
  lastReviewed: '2026-08-17',
  order: 7,
  related: ['/docs/deploy-operate/schema-verification', '/docs/deploy-operate/production-setup'],
};

export default function Page() {
  return (
    <Doc>
      <P lede>
        Apply the migrations in <C>supabase/migrations/</C> to a local Docker stack or your own Supabase
        project. They are timestamp-prefixed and must be applied in lexical order.
      </P>

      <Section id="applying" title="Applying migrations">
        <Tabs items={['Supabase CLI', 'SQL editor', 'Direct Postgres']}>
          <Tab>
            <Terminal>{`bunx supabase login
bunx supabase link --project-ref <your-project-ref>
bunx supabase db push`}</Terminal>
          </Tab>
          <Tab>
            <P>
              Open your project dashboard, open the SQL Editor, and run each file in{' '}
              <C>supabase/migrations/</C> in timestamp order.
            </P>
          </Tab>
          <Tab>
            <Terminal>{`psql "$DATABASE_URL" -f supabase/migrations/20250806092049_initial_schema.sql`}</Terminal>
            <Callout kind="danger" title="Never commit a connection string">
              <C>DATABASE_URL</C> must come from your environment or secret store. Production connection
              strings do not belong in this repository, in an issue, or in a chat message.
            </Callout>
          </Tab>
        </Tabs>
      </Section>

      <Section id="local" title="Local development">
        <Terminal>{`bun run docker:supabase
bunx supabase db reset`}</Terminal>
      </Section>

      <Section id="verify" title="Verify">
        <P>Confirm these tables exist:</P>
        <ul>
          <li><C>users</C>, <C>contacts</C>, <C>chats</C>, <C>messages</C></li>
          <li><C>ai_suggestions</C>, <C>loops</C>, <C>contact_inferences</C></li>
          <li><C>user_preferences</C>, <C>auto_reply_rules</C></li>
        </ul>
        <P>Then reload the PostgREST schema cache so the API sees the new shape immediately:</P>
        <Terminal>{`docker exec supabase-db psql -U postgres -d postgres -c "NOTIFY pgrst, 'reload schema';"`}</Terminal>
      </Section>
    </Doc>
  );
}
