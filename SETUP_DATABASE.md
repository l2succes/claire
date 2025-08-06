# Setting Up the Database

## Quick Setup via Supabase Dashboard

Since the CLI is having authentication issues, let's use the Supabase Dashboard directly:

### Step 1: Run the Migration

1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/khhvrwomoghmwhfxlnky/sql
2. Click on "SQL Editor" in the left sidebar
3. Click "New Query"
4. Copy ALL the contents from: `supabase/migrations/20250806092049_initial_schema.sql`
5. Paste it in the SQL Editor
6. Click "Run" (or press Cmd/Ctrl + Enter)

You should see a success message saying the tables were created.

### Step 2: Verify Tables Were Created

1. Go to "Table Editor" in the left sidebar
2. You should see these tables:
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

### Step 3: Test the Server Connection

Now your server should be able to connect without the "table not found" error:

```bash
cd server
bun run dev
```

## Alternative: Using psql directly

If you prefer command line, you can use psql:

```bash
# Use the connection string from your .env file
psql "postgresql://postgres:ZKE!juj!cnq5bzk8fqv@db.khhvrwomoghmwhfxlnky.supabase.co:5432/postgres" -f supabase/migrations/20250806092049_initial_schema.sql
```

## Troubleshooting

### If you get "extension does not exist" errors:

1. Go to Database > Extensions in Supabase Dashboard
2. Enable these extensions:
   - `uuid-ossp`
   - `pg_trgm`

### If you get "auth.users does not exist" error:

This shouldn't happen as Supabase Auth is enabled by default, but if it does:
1. Make sure Authentication is enabled in your project
2. The auth schema should already exist

### To reset and start fresh:

If you need to drop all tables and start over:

```sql
-- BE CAREFUL: This will delete all data!
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
```

Then run the migration again.

## Next Steps

Once the database is set up:

1. The server should connect without errors
2. You can start developing the frontend
3. Consider adding test data using the seed file (optional)

## For Local Development

If you want to run Supabase locally for development:

```bash
# Install Supabase CLI globally
npm install -g supabase

# Start local Supabase
supabase start

# Your local Supabase will be available at:
# - API: http://localhost:54321
# - Database: postgresql://postgres:postgres@localhost:54322/postgres
# - Studio: http://localhost:54323
```