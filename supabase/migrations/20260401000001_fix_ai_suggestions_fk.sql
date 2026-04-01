-- Fix ai_suggestions.message_id: change TEXT → UUID and add FK to messages(id)
-- The table is empty on Railway (AI generation was never wired up), so the cast is safe.

ALTER TABLE public.ai_suggestions
  ALTER COLUMN message_id TYPE UUID USING message_id::UUID,
  ADD CONSTRAINT ai_suggestions_message_id_fkey
    FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE,
  ADD CONSTRAINT ai_suggestions_message_id_key UNIQUE (message_id);

CREATE INDEX IF NOT EXISTS idx_ai_suggestions_message_id
  ON public.ai_suggestions(message_id);
