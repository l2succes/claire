-- Add snooze support to messages: a message can be snoozed until a future time,
-- at which point it resurfaces in the inbox.

ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS snoozed_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_messages_snoozed_until ON public.messages(snoozed_until)
  WHERE snoozed_until IS NOT NULL;
