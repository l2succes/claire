-- Promises created before the detector stored source context could not open
-- the originating chat and therefore rendered as a generic "Conversation".
-- The update is idempotent: it only derives fields from the immutable source
-- message and never changes promise content, status, dates, or ownership.
UPDATE public.promises AS promise
SET
  chat_id = COALESCE(message.chat_id, promise.chat_id),
  contact_id = COALESCE(message.contact_id, chat.contact_id, promise.contact_id),
  platform = message.platform
FROM public.messages AS message
LEFT JOIN public.chats AS chat
  ON chat.id = message.chat_id
  AND chat.user_id = message.user_id
WHERE promise.message_id = message.id::text
  AND promise.user_id = message.user_id
  AND (
    promise.chat_id IS DISTINCT FROM message.chat_id
    OR promise.contact_id IS DISTINCT FROM COALESCE(message.contact_id, chat.contact_id)
    OR promise.platform IS DISTINCT FROM message.platform
  );
