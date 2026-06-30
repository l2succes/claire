-- RLS Audit: complete Row Level Security on all tables
-- Issue #43: ensure cross-user access is fully denied for INSERT/UPDATE too.
--
-- PostgreSQL uses USING for SELECT/DELETE row filters, and WITH CHECK for
-- INSERT/UPDATE write-side filters. Policies created with only USING (or FOR
-- ALL USING) silently allow inserts with any user_id on tables where the
-- owner column is user_id — because Postgres only applies WITH CHECK on write
-- rows if one is defined; if not defined it falls back to USING, but FOR ALL
-- still needs an explicit WITH CHECK to be airtight.
--
-- This migration:
--   1. Re-creates all FOR-ALL policies with both USING and WITH CHECK.
--   2. Adds an INSERT policy for the users table (signup path).
--   3. Ensures all tables added in later migrations also have WITH CHECK.

-- ============================================================
-- 1. users — split into SELECT / INSERT / UPDATE
-- ============================================================
DROP POLICY IF EXISTS "Users can view own profile"   ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;

CREATE POLICY "Users can view own profile"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.users FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ============================================================
-- 2. platform_sessions (originally whatsapp_sessions)
-- ============================================================
DROP POLICY IF EXISTS "Users can view own sessions"             ON public.platform_sessions;
DROP POLICY IF EXISTS "Users can manage own platform sessions"  ON public.platform_sessions;

CREATE POLICY "Users can manage own platform sessions"
  ON public.platform_sessions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 3. contacts
-- ============================================================
DROP POLICY IF EXISTS "Users can manage own contacts" ON public.contacts;

CREATE POLICY "Users can manage own contacts"
  ON public.contacts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 4. chats
-- ============================================================
DROP POLICY IF EXISTS "Users can manage own chats" ON public.chats;

CREATE POLICY "Users can manage own chats"
  ON public.chats FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 5. messages
-- ============================================================
DROP POLICY IF EXISTS "Users can manage own messages" ON public.messages;

CREATE POLICY "Users can manage own messages"
  ON public.messages FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 6. ai_suggestions
-- ============================================================
DROP POLICY IF EXISTS "Users can manage own suggestions" ON public.ai_suggestions;

CREATE POLICY "Users can manage own suggestions"
  ON public.ai_suggestions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 7. promises
-- ============================================================
DROP POLICY IF EXISTS "Users can manage own promises" ON public.promises;

CREATE POLICY "Users can manage own promises"
  ON public.promises FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 8. contact_inferences
-- ============================================================
DROP POLICY IF EXISTS "Users can view own inferences" ON public.contact_inferences;

CREATE POLICY "Users can view own inferences"
  ON public.contact_inferences FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 9. user_preferences
-- ============================================================
DROP POLICY IF EXISTS "Users can manage own preferences" ON public.user_preferences;

CREATE POLICY "Users can manage own preferences"
  ON public.user_preferences FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 10. auto_reply_rules
-- ============================================================
DROP POLICY IF EXISTS "Users can manage own auto-reply rules" ON public.auto_reply_rules;

CREATE POLICY "Users can manage own auto-reply rules"
  ON public.auto_reply_rules FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 11. platform_settings (added in multi-platform migration)
-- ============================================================
DROP POLICY IF EXISTS "Users can manage own platform settings" ON public.platform_settings;

CREATE POLICY "Users can manage own platform settings"
  ON public.platform_settings FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 12. chat_categories (added in conversation_settings migration)
-- ============================================================
DROP POLICY IF EXISTS "Users manage own chat_categories" ON public.chat_categories;

CREATE POLICY "Users manage own chat_categories"
  ON public.chat_categories FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 13. contact_profiles
-- ============================================================
DROP POLICY IF EXISTS "Users manage own contact_profiles" ON public.contact_profiles;

CREATE POLICY "Users manage own contact_profiles"
  ON public.contact_profiles FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 14. smart_cards
-- ============================================================
DROP POLICY IF EXISTS "Users manage own smart_cards" ON public.smart_cards;

CREATE POLICY "Users manage own smart_cards"
  ON public.smart_cards FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 15. push_tokens — guard for when PR #25/#26 lands
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'push_tokens'
  ) THEN
    -- Drop any existing policy to avoid conflicts
    DROP POLICY IF EXISTS "Users can manage own push tokens" ON public.push_tokens;
    DROP POLICY IF EXISTS "Users manage own push_tokens"    ON public.push_tokens;

    ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

    EXECUTE $p$
      CREATE POLICY "Users manage own push_tokens"
        ON public.push_tokens FOR ALL
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id)
    $p$;
  END IF;
END $$;

-- ============================================================
-- 16. contact_memory — guard for when PR #31 lands
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'contact_memory'
  ) THEN
    DROP POLICY IF EXISTS "Users can manage own contact memory" ON public.contact_memory;
    DROP POLICY IF EXISTS "Users manage own contact_memory"    ON public.contact_memory;

    ALTER TABLE public.contact_memory ENABLE ROW LEVEL SECURITY;

    EXECUTE $p$
      CREATE POLICY "Users manage own contact_memory"
        ON public.contact_memory FOR ALL
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id)
    $p$;
  END IF;
END $$;
