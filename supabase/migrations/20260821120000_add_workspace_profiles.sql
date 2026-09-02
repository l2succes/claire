-- Profiles are an application-level workspace boundary.  They deliberately
-- belong to a Claire user, not auth.users directly, so the existing user
-- provisioning path remains the single source of account ownership.
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 48),
  color TEXT NOT NULL DEFAULT '#7C6EF6' CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  is_personal BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_one_personal
  ON public.profiles(user_id) WHERE is_personal;
CREATE INDEX IF NOT EXISTS idx_profiles_user_order
  ON public.profiles(user_id, sort_order, created_at);

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own workspace profiles" ON public.profiles
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.ensure_personal_profile(target_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE profile_id UUID;
BEGIN
  SELECT id INTO profile_id FROM public.profiles
    WHERE user_id = target_user_id AND is_personal = true LIMIT 1;
  IF profile_id IS NULL THEN
    INSERT INTO public.profiles (user_id, name, color, is_personal, sort_order)
    VALUES (target_user_id, 'Personal', '#7C6EF6', true, 0)
    ON CONFLICT (user_id, name) DO UPDATE SET is_personal = true
    RETURNING id INTO profile_id;
  END IF;
  RETURN profile_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_personal_profile_for_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.ensure_personal_profile(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS create_personal_profile_for_user ON public.users;
CREATE TRIGGER create_personal_profile_for_user
  AFTER INSERT ON public.users FOR EACH ROW EXECUTE FUNCTION public.create_personal_profile_for_user();

-- Existing users retain their exact history; it is simply placed in Personal.
INSERT INTO public.profiles (user_id, name, color, is_personal, sort_order)
SELECT id, 'Personal', '#7C6EF6', true, 0 FROM public.users
ON CONFLICT (user_id, name) DO UPDATE SET is_personal = true;

ALTER TABLE public.platform_sessions ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.chats ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.chats ADD COLUMN IF NOT EXISTS platform_session_id TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.platform_settings ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.auto_reply_rules ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.user_voice_profiles ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;

UPDATE public.platform_sessions s SET profile_id = public.ensure_personal_profile(s.user_id) WHERE profile_id IS NULL;
UPDATE public.contacts c SET profile_id = public.ensure_personal_profile(c.user_id) WHERE profile_id IS NULL;
UPDATE public.chats c SET profile_id = public.ensure_personal_profile(c.user_id), platform_session_id = COALESCE(c.platform_session_id, 'legacy:' || c.platform::text)
  WHERE profile_id IS NULL OR platform_session_id IS NULL;
UPDATE public.messages m SET profile_id = c.profile_id FROM public.chats c WHERE c.id = m.chat_id AND m.profile_id IS NULL;
UPDATE public.user_preferences p SET profile_id = public.ensure_personal_profile(p.user_id) WHERE profile_id IS NULL;
UPDATE public.platform_settings p SET profile_id = public.ensure_personal_profile(p.user_id) WHERE profile_id IS NULL;
UPDATE public.auto_reply_rules r SET profile_id = public.ensure_personal_profile(r.user_id) WHERE profile_id IS NULL;
UPDATE public.user_voice_profiles v SET profile_id = public.ensure_personal_profile(v.user_id) WHERE profile_id IS NULL;

ALTER TABLE public.platform_sessions ALTER COLUMN profile_id SET NOT NULL;
ALTER TABLE public.contacts ALTER COLUMN profile_id SET NOT NULL;
ALTER TABLE public.chats ALTER COLUMN profile_id SET NOT NULL;
ALTER TABLE public.messages ALTER COLUMN profile_id SET NOT NULL;
ALTER TABLE public.user_preferences ALTER COLUMN profile_id SET NOT NULL;

-- A remote chat ID is only meaningful within a particular connected account.
ALTER TABLE public.chats DROP CONSTRAINT IF EXISTS chats_user_platform_chat_key;
ALTER TABLE public.chats ADD CONSTRAINT chats_profile_session_platform_chat_key
  UNIQUE (profile_id, platform_session_id, platform, platform_chat_id);
CREATE INDEX IF NOT EXISTS idx_chats_profile_last_message ON public.chats(profile_id, last_message_at DESC NULLS LAST);
ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_user_platform_contact_key;
ALTER TABLE public.contacts ADD CONSTRAINT contacts_profile_platform_contact_key
  UNIQUE (profile_id, platform, platform_contact_id);
CREATE INDEX IF NOT EXISTS idx_contacts_profile_platform_identity ON public.contacts(profile_id, platform, platform_contact_id);
CREATE INDEX IF NOT EXISTS idx_messages_profile_chat_timestamp ON public.messages(profile_id, chat_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_platform_sessions_profile ON public.platform_sessions(profile_id, platform, status);

ALTER TABLE public.user_preferences DROP CONSTRAINT IF EXISTS user_preferences_user_id_key;
ALTER TABLE public.user_preferences ADD CONSTRAINT user_preferences_user_profile_key UNIQUE (user_id, profile_id);
ALTER TABLE public.platform_settings DROP CONSTRAINT IF EXISTS platform_settings_user_id_platform_key;
ALTER TABLE public.platform_settings ADD CONSTRAINT platform_settings_user_profile_platform_key UNIQUE (user_id, profile_id, platform);
ALTER TABLE public.user_voice_profiles DROP CONSTRAINT IF EXISTS user_voice_profiles_pkey;
ALTER TABLE public.user_voice_profiles ADD PRIMARY KEY (user_id, profile_id, language);

-- Platform IDs are issued by remote accounts, not by Claire users. Two
-- accounts can legitimately use the same remote event identifier.
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_whatsapp_id_key;
ALTER TABLE public.messages ADD CONSTRAINT messages_profile_platform_event_key
  UNIQUE (profile_id, platform, platform_message_id);

-- The view is the shared read primitive for mobile and desktop inboxes.
CREATE OR REPLACE VIEW public.conversation_feed
WITH (security_invoker = true) AS
SELECT c.id AS chat_id, c.user_id, c.platform, c.platform_chat_id,
  c.name AS chat_name, c.is_group, c.is_pinned, c.pinned_at, c.is_archived, c.is_muted,
  c.unread_count, c.last_read_at, c.contact_id, ct.name AS contact_name,
  ct.inferred_name AS contact_inferred_name, ct.avatar_url AS contact_avatar_url, ct.phone_number AS contact_phone,
  m.id AS last_message_id, m.content AS last_message_content, m.content_type AS last_message_content_type,
  m.from_me AS last_message_from_me, m.status AS last_message_status, m.snoozed_until AS last_message_snoozed_until,
  m.contact_name AS last_message_sender_name, m.timestamp AS last_message_at,
  EXISTS (SELECT 1 FROM public.ai_suggestions s WHERE s.message_id = m.id AND s.user_id = c.user_id) AS last_message_has_ai_response,
  COALESCE(m.timestamp, c.last_message_at, c.updated_at, c.created_at) AS last_activity_at,
  m.media_url AS last_message_media_url, m.media_mime_type AS last_message_media_mime_type,
  -- New columns must be appended: CREATE OR REPLACE VIEW preserves existing
  -- column positions for PostgREST clients.
  c.profile_id, c.platform_session_id
FROM public.chats c
LEFT JOIN public.contacts ct ON ct.id = c.contact_id AND ct.profile_id = c.profile_id
LEFT JOIN LATERAL (
  SELECT msg.id, msg.content, msg.content_type, msg.media_url, msg.media_mime_type, msg.from_me, msg.status,
    msg.snoozed_until, msg.contact_name, msg.timestamp
  FROM public.messages msg WHERE msg.chat_id = c.id AND msg.user_id = c.user_id AND msg.profile_id = c.profile_id
  ORDER BY msg.timestamp DESC LIMIT 1
) m ON TRUE;

-- Moving a connection moves its complete durable workspace footprint.  The
-- caller must still verify ownership before invoking this function.
CREATE OR REPLACE FUNCTION public.move_platform_session_to_profile(
  target_user_id UUID, target_session_id TEXT, target_profile_id UUID
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = target_profile_id AND user_id = target_user_id) THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.platform_sessions WHERE session_id = target_session_id AND user_id = target_user_id) THEN
    RAISE EXCEPTION 'Connection not found';
  END IF;
  UPDATE public.platform_sessions SET profile_id = target_profile_id WHERE session_id = target_session_id AND user_id = target_user_id;
  UPDATE public.chats SET profile_id = target_profile_id WHERE platform_session_id = target_session_id AND user_id = target_user_id;
  UPDATE public.contacts c SET profile_id = target_profile_id
    WHERE c.user_id = target_user_id AND EXISTS (SELECT 1 FROM public.chats ch WHERE ch.contact_id = c.id AND ch.platform_session_id = target_session_id);
  UPDATE public.messages m SET profile_id = target_profile_id
    WHERE m.user_id = target_user_id AND EXISTS (SELECT 1 FROM public.chats ch WHERE ch.id = m.chat_id AND ch.platform_session_id = target_session_id);
END;
$$;

NOTIFY pgrst, 'reload schema';
