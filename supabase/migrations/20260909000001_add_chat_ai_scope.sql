-- Group chats are opt-in for AI processing.
--
-- Claire treated a 20-person group exactly like a 1:1: every message generated
-- a draft reply, scheduled loop detection, and fed the morning brief. Most
-- group traffic concerns nobody in particular, so the cost was paid for output
-- nobody wanted. A 1:1 has no such ambiguity, so it stays on.
--
-- NULL means the user has not chosen. Storing the default as NULL rather than
-- materializing it means changing the default later actually changes behaviour
-- for undecided chats, while an explicit TRUE/FALSE survives untouched.

ALTER TABLE public.chats ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN;

COMMENT ON COLUMN public.chats.ai_enabled IS
  'Per-chat AI opt-in. NULL inherits the default (on for 1:1, off for groups); '
  'TRUE/FALSE is an explicit user choice that survives the default changing.';

-- Group classification ---------------------------------------------------------
-- Knowing a room is "Eng Standup" and not "Building 4B Residents" is what makes
-- the opt-in prompt answerable. This never enables anything on its own: it
-- selects the banner copy and labels the inbox row.
--
-- Deliberately NOT a column on chat_categories: that table has
-- `category TEXT NOT NULL CHECK (...)` over a relationship taxonomy that does
-- not describe a group (a group is never 'romantic'), so an inferred row could
-- not exist without also forcing an unrelated user-facing choice. Same reason
-- chat_loop_settings is its own table.

CREATE TABLE IF NOT EXISTS public.chat_classifications (
  user_id        UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  chat_id        UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  category       TEXT NOT NULL CHECK (category IN
                   ('work','planning','family','friends','community','announcement','unknown')),
  confidence     REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  -- 'heuristic' cost nothing and is re-derivable; 'model' cost a call and is
  -- not; 'user' is an explicit correction and is never overwritten.
  method         TEXT NOT NULL CHECK (method IN ('heuristic','model','user')),
  reason         TEXT,
  signals        JSONB NOT NULL DEFAULT '{}'::jsonb,
  prompt_version TEXT,
  classified_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, chat_id)
);

ALTER TABLE public.chat_classifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own chat_classifications" ON public.chat_classifications;
CREATE POLICY "Users manage own chat_classifications"
  ON public.chat_classifications FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- conversation_feed ------------------------------------------------------------
-- Recreated in full from 20260817000000_add_conversation_feed.sql with four
-- columns appended. The body below is unchanged from that file.

CREATE OR REPLACE VIEW public.conversation_feed
WITH (security_invoker = true) AS
SELECT
  c.id                        AS chat_id,
  c.user_id,
  c.platform,
  c.platform_chat_id,
  c.name                      AS chat_name,
  c.is_group,
  c.is_pinned,
  c.pinned_at,
  c.is_archived,
  c.is_muted,
  c.unread_count,
  c.last_read_at,
  c.contact_id,
  ct.name                     AS contact_name,
  ct.inferred_name            AS contact_inferred_name,
  ct.avatar_url               AS contact_avatar_url,
  ct.phone_number             AS contact_phone,
  m.id                        AS last_message_id,
  m.content                   AS last_message_content,
  m.content_type              AS last_message_content_type,
  m.from_me                   AS last_message_from_me,
  m.status                    AS last_message_status,
  m.snoozed_until             AS last_message_snoozed_until,
  -- In a group the latest sender is not the conversation's identity, so keep
  -- it separate from contact_name rather than overwriting it.
  m.contact_name              AS last_message_sender_name,
  m.timestamp                 AS last_message_at,
  -- The inbox badges conversations whose newest message already has a drafted
  -- reply. message_id was TEXT in the initial schema but
  -- 20260401000001_fix_ai_suggestions_fk.sql converted it to UUID, so this is a
  -- plain uuid comparison.
  EXISTS (
    SELECT 1
    FROM public.ai_suggestions s
    WHERE s.message_id = m.id
      AND s.user_id = c.user_id
  )                           AS last_message_has_ai_response,
  -- Single ordering key. chats.last_message_at is maintained by the ingest
  -- path and can lag or be null for a chat that has never received a message;
  -- fall back so a conversation never sorts to the bottom for lack of a value.
  COALESCE(m.timestamp, c.last_message_at, c.updated_at, c.created_at)
                              AS last_activity_at,
  -- Appended rather than grouped with the other last_message_* columns:
  -- CREATE OR REPLACE VIEW only accepts new columns at the end, so keeping
  -- them here lets this file be re-run against an existing view.
  -- The inbox shows a thumbnail beside a media conversation's preview line, so
  -- it needs the attachment itself, not just the content type.
  m.media_url                 AS last_message_media_url,
  m.media_mime_type           AS last_message_media_mime_type,
  -- Appended in 20260909000001. Same constraint as the block above: CREATE OR
  -- REPLACE VIEW only accepts new columns in the last position, which is why
  -- the AI-scope and classification columns land together in one statement
  -- rather than in two migrations.
  --
  -- The effective scope is computed here so every reader agrees on it: the
  -- mobile and desktop clients query this view directly and never see the
  -- server's copy of the rule.
  c.ai_enabled,
  COALESCE(c.ai_enabled, NOT c.is_group)
                              AS ai_processing_enabled,
  cc.category                 AS ai_category,
  cc.confidence               AS ai_category_confidence
FROM public.chats c
LEFT JOIN public.contacts ct
  ON ct.id = c.contact_id
LEFT JOIN LATERAL (
  SELECT
    msg.id,
    msg.content,
    msg.content_type,
    msg.media_url,
    msg.media_mime_type,
    msg.from_me,
    msg.status,
    msg.snoozed_until,
    msg.contact_name,
    msg.timestamp
  FROM public.messages msg
  WHERE msg.chat_id = c.id
    AND msg.user_id = c.user_id
  ORDER BY msg.timestamp DESC
  LIMIT 1
) m ON TRUE
LEFT JOIN public.chat_classifications cc
  ON cc.chat_id = c.id AND cc.user_id = c.user_id;

COMMENT ON VIEW public.conversation_feed IS
  'One row per conversation with its latest message denormalized. Order by '
  '(last_activity_at DESC, chat_id DESC) for stable keyset pagination. '
  'ai_processing_enabled is the effective AI scope: groups are opt-in.';

GRANT SELECT ON public.conversation_feed TO authenticated;
GRANT SELECT ON public.conversation_feed TO service_role;
