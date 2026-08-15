ALTER TABLE public.chats
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_chats_user_pinned
  ON public.chats(user_id, is_pinned DESC, pinned_at DESC)
  WHERE is_archived = FALSE;
