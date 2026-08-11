-- Deliver incoming and outgoing conversation messages to subscribed clients.
-- Keep this safe to run against environments where the table was already
-- added manually or by an earlier bootstrap.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END
$$;

-- Required for UPDATE/DELETE payloads and filtered subscriptions.
ALTER TABLE public.messages REPLICA IDENTITY FULL;

-- AI suggestions are generated asynchronously after the message insert. The
-- chat screen subscribes so a generated suggestion appears without a reload.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'ai_suggestions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_suggestions;
  END IF;
END
$$;

ALTER TABLE public.ai_suggestions REPLICA IDENTITY FULL;
