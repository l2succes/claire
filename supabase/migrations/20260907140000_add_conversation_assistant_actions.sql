-- Suggested actions are user-triggered navigation aids, never automated sends or bookings.
ALTER TABLE public.conversation_assistant_turns
  ADD COLUMN IF NOT EXISTS actions JSONB NOT NULL DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
