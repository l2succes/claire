# Deploying the Database

Apply Claire migrations from `supabase/migrations/` with the Supabase CLI. The production target is Railway's direct Postgres endpoint.

## Railway production

Set `DIRECT_DATABASE_URL` to Railway's **direct Postgres connection string** (a `postgresql://...` URL), not `SUPABASE_URL` or another HTTP endpoint. Railway's TCP proxy does not use TLS, so its URL must include `?sslmode=disable`. Keep this value in Railway or your local secret manager; do not commit it.

```bash
export DIRECT_DATABASE_URL='postgresql://…?sslmode=disable'
bun run db:push:railway:dry-run
bun run db:push:railway
```

`db push --db-url` applies only migrations not already recorded in the target database. It does not require `supabase link`, which is for Supabase-hosted projects.

## Supabase-hosted projects

```bash
bunx supabase login
bunx supabase link --project-ref <your-project-ref>
bunx supabase db push
```

## Dashboard SQL Editor

1. Open your Supabase project dashboard.
2. Open the SQL Editor.
3. Run each file in `supabase/migrations/` in timestamp order.

## Direct Postgres fallback

```bash
psql "$DATABASE_URL" -f supabase/migrations/20250806092049_initial_schema.sql
```

`DATABASE_URL` must come from your environment or secret store. Do not paste production connection strings into this repository.

## Local development

```bash
bun run docker:supabase
bunx supabase db reset
```

## Verify

Confirm these tables exist: `users`, `contacts`, `chats`, `messages`, `ai_suggestions`, `promises`, `contact_inferences`, `user_preferences`, `auto_reply_rules`.
