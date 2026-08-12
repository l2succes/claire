-- Claire owns a per-user read cursor for each unified conversation. Matrix
-- receipts are synchronized as a side effect, but the local cursor remains
-- stable across bridges, devices, and platforms that expose different unread
-- semantics.
ALTER TABLE public.chats
ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_read_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_chats_user_unread
ON public.chats(user_id, unread_count)
WHERE unread_count > 0;

-- Chat unread counters and read cursors update independently of message rows.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'chats'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chats;
  END IF;
END
$$;

ALTER TABLE public.chats REPLICA IDENTITY FULL;

CREATE OR REPLACE FUNCTION public.increment_chat_unread(
  target_chat_id UUID,
  target_user_id UUID
)
RETURNS VOID
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.chats
  SET unread_count = COALESCE(unread_count, 0) + 1,
      updated_at = NOW()
  WHERE id = target_chat_id
    AND user_id = target_user_id;
$$;

REVOKE ALL ON FUNCTION public.increment_chat_unread(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_chat_unread(UUID, UUID) TO service_role;
