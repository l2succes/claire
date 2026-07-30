# Database schema & drift verification (#99)

Production once ran "healthy" while the Supabase schema was behind the deployed
code — a missing `messages.snoozed_until` column had to be added by hand. This
document defines how migrations are applied and how drift is detected so that
never silently happens again.

## Applying migrations (one command, no manual SQL)

All schema lives in `supabase/migrations/*.sql` and is written to be idempotent
(`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`). Apply the full set to
any target with the Supabase CLI:

```bash
supabase db push        # applies pending migrations to the linked project
```

For a raw Postgres/Railway connection without the CLI, apply the files in
lexical order (they are timestamp-prefixed):

```bash
for f in supabase/migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done
```

After applying, reload the PostgREST schema cache so the API sees new
columns/tables immediately:

```sql
NOTIFY pgrst, 'reload schema';
```

## Drift detection

The application declares the columns it requires in
`server/src/services/schema-verification.ts` (`REQUIRED_SCHEMA`). **Extend that
list whenever a migration adds a column/table the code reads or writes.**

Two surfaces consume it:

1. **Pre-deploy gate** — run before shipping code that depends on new schema:

   ```bash
   cd server && bun run verify:schema
   ```

   Exits `0` when the live DB satisfies `REQUIRED_SCHEMA`, `1` on drift (listing
   the missing tables/columns), `2` if the check could not run. Wire this into
   the deploy pipeline as a pre-release step against the production database.

2. **Runtime readiness** — `GET /health` includes a `schema` check. On drift it
   reports `status: "degraded"` with HTTP `503` and a `checks.schema` entry
   listing the affected tables, so an incompatible deploy fails readiness before
   taking traffic. The result is cached for 60s to keep polling cheap.

Detection is RLS-safe: a missing column/table returns a Postgres
`42703`/`42P01` (or PostgREST `PGRST204`/`PGRST205`) error regardless of
row-level security, while a present-but-empty table simply returns no rows.
Transient/operational errors (network, expired JWT) are **not** reported as
drift.

## Backup & rollback expectations

- **Backup**: Railway Supabase runs automated daily backups; take an on-demand
  snapshot immediately before applying migrations to production.
- **Forward-only**: migrations are additive and idempotent; re-running them is
  safe. Prefer a new corrective migration over editing a shipped one.
- **Rollback**: if a deploy fails `verify:schema` or `/health` schema readiness,
  roll the *application* back to the previous release (which matched the prior
  schema) rather than dropping columns. Additive columns left in place are
  harmless to older code.
