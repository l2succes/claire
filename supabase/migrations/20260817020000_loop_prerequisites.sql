-- Loop revamp prerequisites: persist three ingest fields that the adapters
-- already compute and then silently drop, plus a user-level timezone.
--
-- See docs/LOOPS_REVAMP_PLAN.md §3. Each of these is load-bearing for the
-- relevance model: without them, "does this group message concern me?" has to
-- fall back to text matching, which does not generalize across platforms.

-- 1. Reply, thread, and mention structure on messages -------------------------

ALTER TABLE public.messages
  -- Reply target. The platform id is what the bridge gives us; the UUID is
  -- resolved against messages.whatsapp_id when the target has been ingested.
  ADD COLUMN IF NOT EXISTS reply_to_platform_message_id TEXT,
  ADD COLUMN IF NOT EXISTS reply_to_message_id UUID
    REFERENCES public.messages(id) ON DELETE SET NULL,

  -- Native threading (Slack, Discord). Null on reply-only platforms.
  ADD COLUMN IF NOT EXISTS thread_root_platform_id TEXT,
  ADD COLUMN IF NOT EXISTS thread_root_message_id UUID
    REFERENCES public.messages(id) ON DELETE SET NULL,

  -- Structured @-mentions, stored as platform contact identifiers.
  -- mentions_room covers @channel/@here/@everyone, which address everyone and
  -- must therefore never be read as addressing one person.
  ADD COLUMN IF NOT EXISTS mentions TEXT[],
  ADD COLUMN IF NOT EXISTS mentions_room BOOLEAN NOT NULL DEFAULT FALSE,

  -- Kept so mentions can be recovered for rows ingested before m.mentions was
  -- read. event-converter previously stored `format` but discarded the body.
  ADD COLUMN IF NOT EXISTS formatted_body TEXT;

-- "Did this reply to something I sent?" — the strongest group-relevance signal.
CREATE INDEX IF NOT EXISTS idx_messages_reply_to
  ON public.messages(user_id, reply_to_message_id)
  WHERE reply_to_message_id IS NOT NULL;

-- Thread-scoped detection windows.
CREATE INDEX IF NOT EXISTS idx_messages_thread_root
  ON public.messages(user_id, chat_id, thread_root_message_id)
  WHERE thread_root_message_id IS NOT NULL;

-- Unresolved reply/thread targets get resolved on later ingest passes.
CREATE INDEX IF NOT EXISTS idx_messages_reply_unresolved
  ON public.messages(user_id, reply_to_platform_message_id)
  WHERE reply_to_platform_message_id IS NOT NULL AND reply_to_message_id IS NULL;

COMMENT ON COLUMN public.messages.mentions IS
  'Structured @-mentions as platform contact ids. Preferred over parsing content: '
  'WhatsApp renders mentions as phone numbers, Telegram as handles, Slack as display names.';
COMMENT ON COLUMN public.messages.mentions_room IS
  'Broadcast mention (@channel/@here/@everyone). Evidence a message is NOT addressed to one person.';

-- 1b. Resolve platform reply/thread ids to message UUIDs ---------------------
-- Done in the database rather than the ingest path for two reasons: it covers
-- every writer (live ingest, the Matrix sync script, the companion app), and it
-- handles out-of-order arrival — during backfill a reply frequently lands before
-- the message it replies to, so a one-shot lookup at insert time would miss.

CREATE OR REPLACE FUNCTION public.resolve_message_relations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Backward: resolve this row's targets if they are already ingested.
  IF NEW.reply_to_platform_message_id IS NOT NULL AND NEW.reply_to_message_id IS NULL THEN
    SELECT m.id INTO NEW.reply_to_message_id
    FROM public.messages m
    WHERE m.whatsapp_id = NEW.reply_to_platform_message_id
    LIMIT 1;
  END IF;

  IF NEW.thread_root_platform_id IS NOT NULL AND NEW.thread_root_message_id IS NULL THEN
    SELECT m.id INTO NEW.thread_root_message_id
    FROM public.messages m
    WHERE m.whatsapp_id = NEW.thread_root_platform_id
    LIMIT 1;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.backfill_message_relations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Forward: any earlier row that pointed at this message by platform id but
  -- could not resolve it yet. Both updates hit partial indexes and normally
  -- match zero rows.
  UPDATE public.messages
  SET reply_to_message_id = NEW.id
  WHERE user_id = NEW.user_id
    AND reply_to_platform_message_id = NEW.whatsapp_id
    AND reply_to_message_id IS NULL;

  UPDATE public.messages
  SET thread_root_message_id = NEW.id
  WHERE user_id = NEW.user_id
    AND thread_root_platform_id = NEW.whatsapp_id
    AND thread_root_message_id IS NULL;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS resolve_message_relations_trigger ON public.messages;
CREATE TRIGGER resolve_message_relations_trigger
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.resolve_message_relations();

DROP TRIGGER IF EXISTS backfill_message_relations_trigger ON public.messages;
CREATE TRIGGER backfill_message_relations_trigger
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.backfill_message_relations();

-- Supports the forward-resolution updates above.
CREATE INDEX IF NOT EXISTS idx_messages_thread_root_unresolved
  ON public.messages(user_id, thread_root_platform_id)
  WHERE thread_root_platform_id IS NOT NULL AND thread_root_message_id IS NULL;

-- 2. Chat member count -------------------------------------------------------
-- UnifiedChat.participantCount is populated by the adapters and was never
-- written. Without it, participant counts are derived from distinct senders,
-- so a 5,000-member Slack channel where three people post reads as a small
-- group — scoring it as more personal than a family chat.

ALTER TABLE public.chats
  ADD COLUMN IF NOT EXISTS member_count INTEGER;

COMMENT ON COLUMN public.chats.member_count IS
  'Total members as reported by the bridge, where available. Prefer over sender-derived '
  'roster size for broadcast/small-group detection.';

-- 3. User timezone -----------------------------------------------------------
-- Relative deadlines ("by Friday") currently resolve in server-local time.

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC';

-- Seed from the most recently seen device that reported a real timezone.
UPDATE public.user_preferences p
SET timezone = d.timezone
FROM (
  SELECT DISTINCT ON (user_id) user_id, timezone
  FROM public.notification_devices
  WHERE timezone IS NOT NULL AND timezone <> 'UTC'
  ORDER BY user_id, last_seen_at DESC
) d
WHERE d.user_id = p.user_id
  AND p.timezone = 'UTC';

NOTIFY pgrst, 'reload schema';
