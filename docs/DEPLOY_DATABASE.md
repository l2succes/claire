# Deploying the Database

Apply Claire migrations from `supabase/migrations/` to a local Docker stack or your own Supabase project.

## Option 1: Supabase CLI

```bash
bunx supabase login
bunx supabase link --project-ref <your-project-ref>
bunx supabase db push
```

## Option 2: Dashboard SQL Editor

1. Open your Supabase project dashboard.
2. Open the SQL Editor.
3. Run each file in `supabase/migrations/` in timestamp order.

## Option 3: Direct Postgres

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
