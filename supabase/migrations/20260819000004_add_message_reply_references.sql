-- Persist native reply relationships independently from message body content.
-- The platform identifier is retained for delayed/out-of-order bridge events;
-- the local key supports inexpensive quote rendering and jump-to-source.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reply_to_platform_message_id TEXT;

CREATE INDEX IF NOT EXISTS messages_reply_target_lookup_idx
  ON public.messages (user_id, chat_id, reply_to_platform_message_id)
  WHERE reply_to_platform_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS messages_reply_local_target_idx
  ON public.messages (reply_to_message_id)
  WHERE reply_to_message_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
