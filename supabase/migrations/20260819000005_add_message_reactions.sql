-- One row is one platform reaction event. Message content never belongs here;
-- the relation to a message is sufficient for rendering reaction chips.
CREATE TABLE IF NOT EXISTS public.message_reactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  platform_event_id TEXT NOT NULL UNIQUE,
  emoji TEXT NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 32),
  from_me BOOLEAN NOT NULL DEFAULT FALSE,
  reactor_id TEXT NOT NULL,
  reactor_name TEXT,
  reacted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, message_id, reactor_id, emoji)
);

CREATE INDEX IF NOT EXISTS message_reactions_message_idx
  ON public.message_reactions (message_id, reacted_at ASC);
CREATE INDEX IF NOT EXISTS message_reactions_user_idx
  ON public.message_reactions (user_id, reacted_at DESC);

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own message reactions" ON public.message_reactions;
CREATE POLICY "Users can manage own message reactions"
  ON public.message_reactions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'message_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
  END IF;
END
$$;

ALTER TABLE public.message_reactions REPLICA IDENTITY FULL;
NOTIFY pgrst, 'reload schema';
