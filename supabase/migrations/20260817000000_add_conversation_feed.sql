-- The inbox is a list of conversations, but until now the only thing the
-- clients could paginate was `messages`. Collapsing messages into
-- conversations client-side means a page of 20 rows can yield as few as 2-3
-- conversations (a busy chat contributes many rows to the same page), so
-- reaching an old-but-quiet conversation takes hundreds of pages. Worse, the
-- "has more" flag is derived from the message count, so the list promises more
-- forever while delivering almost nothing new, and any client-side search only
-- ever sees the handful of conversations already loaded.
--
-- `conversation_feed` is the missing primitive: exactly one row per
-- conversation, with the latest message denormalized onto it, ordered by a
-- single stable activity timestamp. A page of 20 is 20 conversations, keyset
-- pagination is well defined, and search can run in the database over every
-- conversation instead of over whatever happened to be in memory.
--
-- It is a view rather than a table so there is no dual-write to keep in sync:
-- chats and messages remain the single source of truth. security_invoker makes
-- the underlying RLS policies on chats/messages/contacts apply to the caller,
-- so the view grants no access a direct query would not.

-- The lateral below is the hot path: newest message for one chat. Without this
-- index it degrades into a per-chat sort over the whole message history.
CREATE INDEX IF NOT EXISTS idx_messages_chat_timestamp
  ON public.messages(chat_id, timestamp DESC);

-- Keyset pagination orders by (last_activity_at DESC, chat_id DESC) per user.
CREATE INDEX IF NOT EXISTS idx_chats_user_last_message
  ON public.chats(user_id, last_message_at DESC NULLS LAST);

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
  m.media_mime_type           AS last_message_media_mime_type
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
) m ON TRUE;

COMMENT ON VIEW public.conversation_feed IS
  'One row per conversation with its latest message denormalized. Order by '
  '(last_activity_at DESC, chat_id DESC) for stable keyset pagination.';

GRANT SELECT ON public.conversation_feed TO authenticated;
GRANT SELECT ON public.conversation_feed TO service_role;
