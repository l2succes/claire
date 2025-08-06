# Deploying Database to Supabase

## Option 1: Using Supabase CLI (Recommended)

1. **Login to Supabase CLI**
   ```bash
   bunx supabase login
   ```
   Or if in a non-interactive environment:
   ```bash
   bunx supabase login --token YOUR_ACCESS_TOKEN
   ```

2. **Link your project**
   ```bash
   bunx supabase link --project-ref khhvrwomoghmwhfxlnky
   ```

3. **Push migrations to database**
   ```bash
   bunx supabase db push
   ```

4. **Optional: Seed the database (for development)**
   ```bash
   bunx supabase db push --include-seed
   ```

## Option 2: Using Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to the SQL Editor
3. Copy the contents of `supabase/migrations/20250806092049_initial_schema.sql`
4. Paste and run the SQL in the editor
5. Optionally run the seed file for test data

## Option 3: Direct Database Connection

You can also connect directly using any PostgreSQL client:

```bash
psql "postgresql://postgres:YOUR_PASSWORD@db.khhvrwomoghmwhfxlnky.supabase.co:5432/postgres"
```

Then run:
```sql
\i supabase/migrations/20250806092049_initial_schema.sql
```

## Verifying the Migration

After running the migration, verify that tables were created:

1. Go to Table Editor in Supabase Dashboard
2. You should see these tables:
   - users
   - whatsapp_sessions
   - contacts
   - chats
   - messages
   - ai_suggestions
   - promises
   - contact_inferences
   - user_preferences
   - auto_reply_rules

## Troubleshooting

If you encounter errors:

1. **Extension not available**: Some extensions might need to be enabled in Database > Extensions
2. **RLS policies**: Ensure Row Level Security is properly configured
3. **Auth reference**: The users table references auth.users, which requires Supabase Auth to be enabled

## Local Development

For local development with Supabase:

```bash
# Start local Supabase
bunx supabase start

# Reset local database and apply migrations
bunx supabase db reset

# Stop local Supabase
bunx supabase stop
```