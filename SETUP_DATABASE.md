# Setting Up the Database

Claire’s schema lives in `supabase/migrations/`. Use the local Docker stack for development. Cloud projects should apply the same migrations through the Supabase CLI or SQL Editor.

## Local development (recommended)

```bash
bun run docker:supabase
# Then apply migrations with your local connection string from server/.env
psql "$DATABASE_URL" -f supabase/migrations/20250806092049_initial_schema.sql
```

Local defaults from the Docker stack:

- API: `http://localhost:8000`
- Database: `postgresql://postgres:postgres@localhost:54322/postgres`
- Studio: `http://localhost:8000` (Kong) or the Studio port published by the compose file

## Cloud or self-hosted Supabase

1. Copy `server/.env.example` to `server/.env` and set `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, and `DATABASE_URL` from your project.
2. Open the SQL Editor in your Supabase dashboard.
3. Paste and run `supabase/migrations/20250806092049_initial_schema.sql`.
4. Repeat for later files in `supabase/migrations/` in timestamp order.

Or use the CLI:

```bash
bunx supabase login
bunx supabase link --project-ref <your-project-ref>
bunx supabase db push
```

## Scripted setup

```bash
export SUPABASE_URL="https://<your-project-ref>.supabase.co"
export SUPABASE_SERVICE_KEY="<your-service-role-key>"
bun run scripts/setup-database.js
```

The script requires both environment variables. It has no hardcoded project URL or service-role fallback.

## Verify tables

You should see at least:

- `users`
- `whatsapp_sessions`
- `contacts`
- `chats`
- `messages`
- `ai_suggestions`
- `promises`
- `contact_inferences`
- `user_preferences`
- `auto_reply_rules`

## Troubleshooting

If extensions are missing, enable `uuid-ossp` and `pg_trgm` in Database → Extensions.

To reset a **local** database only:

```sql
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
```

Do not run that against a shared or production database.
