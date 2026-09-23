-- A bridged own-device receipt advances Claire's local cursor. Locking the chat
-- serializes this with other receipt updates; a receipt for an older message
-- cannot move the cursor backwards or resurrect an unread badge.
CREATE OR REPLACE FUNCTION public.reconcile_matrix_read_receipt(
  target_user_id UUID,
  target_platform TEXT,
  target_platform_chat_id TEXT,
  target_matrix_event_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_chat public.chats%ROWTYPE;
  target_message public.messages%ROWTYPE;
  remaining_unread INTEGER;
BEGIN
  SELECT * INTO target_chat FROM public.chats
  WHERE user_id = target_user_id
    AND platform::TEXT = target_platform
    AND platform_chat_id = target_platform_chat_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  SELECT * INTO target_message FROM public.messages
  WHERE user_id = target_user_id
    AND chat_id = target_chat.id
    AND platform_message_id = target_matrix_event_id
  LIMIT 1;
  IF NOT FOUND OR (target_chat.last_read_at IS NOT NULL AND target_message.timestamp < target_chat.last_read_at) THEN
    RETURN FALSE;
  END IF;

  SELECT COUNT(*) INTO remaining_unread FROM public.messages
  WHERE user_id = target_user_id
    AND chat_id = target_chat.id
    AND from_me = FALSE
    AND timestamp > target_message.timestamp;

  UPDATE public.chats
  SET unread_count = remaining_unread,
      last_read_at = target_message.timestamp,
      last_read_message_id = target_message.id,
      updated_at = NOW()
  WHERE id = target_chat.id;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_matrix_read_receipt(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_matrix_read_receipt(UUID, TEXT, TEXT, TEXT) TO service_role;
