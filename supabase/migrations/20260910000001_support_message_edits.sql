-- Preserve source message identity when Matrix delivers an m.replace event.
-- Reactions, replies, citations, and local caches all point at messages.id, so
-- an edit must update the original row rather than insert a second message.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS latest_edit_platform_message_id TEXT;

CREATE INDEX IF NOT EXISTS messages_edit_target_lookup_idx
  ON public.messages (user_id, platform, platform_message_id);

COMMENT ON COLUMN public.messages.edited_at IS
  'Source-platform timestamp of the latest applied message edit.';
COMMENT ON COLUMN public.messages.latest_edit_platform_message_id IS
  'Source-platform event id of the latest applied edit revision.';

CREATE OR REPLACE FUNCTION public.apply_message_edit(
  p_user_id UUID,
  p_platform platform_type,
  p_platform_chat_id TEXT,
  p_target_platform_message_id TEXT,
  p_edit_platform_message_id TEXT,
  p_edit_timestamp TIMESTAMPTZ,
  p_content TEXT,
  p_content_type TEXT,
  p_formatted_body TEXT,
  p_mentions TEXT[],
  p_mentions_room BOOLEAN,
  p_from_me BOOLEAN,
  p_matrix_room_id TEXT DEFAULT NULL,
  p_matrix_sender_id TEXT DEFAULT NULL
)
RETURNS TABLE (
  message_id UUID,
  message_chat_id UUID,
  message_contact_name TEXT,
  message_from_me BOOLEAN,
  message_timestamp TIMESTAMPTZ,
  message_platform TEXT,
  edit_applied BOOLEAN,
  duplicate_removed BOOLEAN
)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  target public.messages%ROWTYPE;
  removed_count INTEGER := 0;
BEGIN
  -- The room/chat, direction and (when available) Matrix sender must agree.
  -- Matrix homeservers validate this too, but enforcing it here prevents a
  -- malformed bridge event from editing another conversation's row.
  SELECT m.* INTO target
  FROM public.messages m
  JOIN public.chats c ON c.id = m.chat_id AND c.user_id = p_user_id
  WHERE m.user_id = p_user_id
    AND m.platform = p_platform
    AND m.platform_message_id = p_target_platform_message_id
    AND c.platform = p_platform
    AND c.platform_chat_id = p_platform_chat_id
    AND m.from_me = p_from_me
    AND (
      p_matrix_room_id IS NULL
      OR NULLIF(m.metadata->>'matrixRoomId', '') IS NULL
      OR m.metadata->>'matrixRoomId' = p_matrix_room_id
    )
    AND (
      p_matrix_sender_id IS NULL
      OR NULLIF(m.metadata->>'matrixSenderId', '') IS NULL
      OR m.metadata->>'matrixSenderId' = p_matrix_sender_id
    )
  FOR UPDATE OF m;

  -- Older Claire builds stored the compatibility "* edited text" event as a
  -- separate row. A normal Matrix history replay now repairs that duplicate.
  DELETE FROM public.messages m
  WHERE m.user_id = p_user_id
    AND m.platform = p_platform
    AND m.platform_message_id = p_edit_platform_message_id
    AND (target.id IS NULL OR m.id <> target.id);
  GET DIAGNOSTICS removed_count = ROW_COUNT;

  IF target.id IS NULL THEN
    RETURN;
  END IF;

  -- Matrix defines the winning edit by timestamp, then lexicographically by
  -- event id. The row lock makes this deterministic under rapid edits.
  IF target.edited_at IS NOT NULL AND (
    target.edited_at > p_edit_timestamp
    OR (
      target.edited_at = p_edit_timestamp
      AND COALESCE(target.latest_edit_platform_message_id, '') >= p_edit_platform_message_id
    )
  ) THEN
    RETURN QUERY SELECT
      target.id,
      target.chat_id,
      target.contact_name,
      target.from_me,
      target.timestamp,
      target.platform::TEXT,
      FALSE,
      removed_count > 0;
    RETURN;
  END IF;

  UPDATE public.messages m
  SET content = p_content,
      type = p_content_type,
      content_type = p_content_type,
      formatted_body = p_formatted_body,
      mentions = p_mentions,
      mentions_room = p_mentions_room,
      edited_at = p_edit_timestamp,
      latest_edit_platform_message_id = p_edit_platform_message_id
  WHERE m.id = target.id;

  RETURN QUERY SELECT
    target.id,
    target.chat_id,
    target.contact_name,
    target.from_me,
    target.timestamp,
    target.platform::TEXT,
    TRUE,
    removed_count > 0;
END;
$$;

NOTIFY pgrst, 'reload schema';
