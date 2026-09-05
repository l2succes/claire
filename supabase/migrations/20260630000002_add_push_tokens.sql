-- Push tokens: store Expo push notification tokens per user/device
--
-- Idempotent because this migration's version changed after it had already run.
-- It previously shared 20260630000001 with add_message_snooze, so only one of
-- the two was ever recorded; renaming it to ...0002 fixed the collision but
-- left a file that a database has applied under a version it no longer claims.
-- The next `supabase db push` will therefore try to run it again, and a plain
-- CREATE TABLE would fail against any environment where push_tokens exists.
CREATE TABLE IF NOT EXISTS push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'expo',
  device_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, token)
);

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own push_tokens" ON push_tokens;
CREATE POLICY "Users manage own push_tokens" ON push_tokens FOR ALL USING (auth.uid() = user_id);

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
