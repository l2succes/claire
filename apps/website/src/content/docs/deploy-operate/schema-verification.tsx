// SPDX-License-Identifier: Apache-2.0
import { C, Callout, Code, Doc, P, Section, Terminal } from '@/components/docs/blocks';
import type { DocMeta } from '@/lib/docs-types';

export const meta: DocMeta = {
  title: 'Database schema verification',
  description: 'Detect schema drift and verify production database migrations.',
  section: 'deploy-operate',
  status: 'current',
  lastReviewed: '2026-08-17',
  order: 8,
  roadmap: {
    status: 'in_progress',
    summary: 'Add production migration and schema-drift verification.',
    issue: 'https://github.com/l2succes/claire/issues/99',
  },
  related: ['/docs/deploy-operate/database-deploy', '/docs/deploy-operate/production-setup'],
};

export default function Page() {
  return (
    <Doc>
      <P lede>
        Production once ran &ldquo;healthy&rdquo; while the schema was behind the deployed code — a
        missing <C>messages.snoozed_until</C> column had to be added by hand. This page defines how
        migrations are applied and how drift is detected, so that cannot happen silently again.
      </P>

      <Section id="applying" title="Applying migrations">
        <P>
          All schema lives in <C>supabase/migrations/*.sql</C> and is written to be idempotent (
          <C>CREATE TABLE IF NOT EXISTS</C>, <C>ADD COLUMN IF NOT EXISTS</C>), so re-running the full set
          is always safe.
        </P>
        <Terminal>{`supabase db push`}</Terminal>
        <P>Against a raw Postgres connection without the CLI, apply in lexical order:</P>
        <Terminal>{`for f in supabase/migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done`}</Terminal>
        <P>Then reload the PostgREST schema cache so the API sees new columns immediately:</P>
        <Code lang="sql" title="Reload the API schema">{`NOTIFY pgrst, 'reload schema';`}</Code>
      </Section>

      <Section id="drift" title="Drift detection">
        <P>
          The application declares the columns it requires in{' '}
          <C>server/src/services/schema-verification.ts</C> as <C>REQUIRED_SCHEMA</C>.
        </P>
        <Callout kind="warning" title="Extend the list with the migration">
          Whenever a migration adds a table or column the code reads or writes, add it to{' '}
          <C>REQUIRED_SCHEMA</C> in the same change. The gate is only as good as that list.
        </Callout>

        <Section id="pre-deploy" title="Pre-deploy gate" level={3}>
          <Terminal cwd="server">{`bun run verify:schema`}</Terminal>
          <P>
            Exits <C>0</C> when the live database satisfies <C>REQUIRED_SCHEMA</C>, <C>1</C> on drift
            (listing the missing tables and columns), and <C>2</C> if the check could not run. Wire it
            into the deploy pipeline as a pre-release step against the production database.
          </P>
        </Section>

        <Section id="runtime" title="Runtime readiness" level={3}>
          <P>
            <C>GET /health</C> includes a <C>schema</C> check. On drift it reports{' '}
            <C>status: &quot;degraded&quot;</C> with HTTP <C>503</C> and a <C>checks.schema</C> entry
            listing the affected tables, so an incompatible deploy fails readiness before taking traffic.
            The result is cached for 60 seconds to keep polling cheap.
          </P>
        </Section>

        <Section id="rls" title="Why this is RLS-safe" level={3}>
          <P>
            A missing column or table returns a Postgres <C>42703</C>/<C>42P01</C> — or PostgREST{' '}
            <C>PGRST204</C>/<C>PGRST205</C> — regardless of row-level security, while a
            present-but-empty table simply returns no rows. Transient and operational errors (network
            failures, expired JWTs) are deliberately not reported as drift.
          </P>
        </Section>
      </Section>

      <Section id="rollback" title="Backup and rollback expectations">
        <ul>
          <li>
            <b>Backup.</b> Automated daily backups run on the managed database; take an on-demand snapshot
            immediately before applying migrations to production.
          </li>
          <li>
            <b>Forward-only.</b> Migrations are additive and idempotent. Prefer a new corrective migration
            over editing one that has shipped.
          </li>
          <li>
            <b>Rollback.</b> If a deploy fails <C>verify:schema</C> or health readiness, roll the{' '}
            <em>application</em> back to the previous release rather than dropping columns. Additive
            columns left in place are harmless to older code.
          </li>
        </ul>
      </Section>
    </Doc>
  );
}
