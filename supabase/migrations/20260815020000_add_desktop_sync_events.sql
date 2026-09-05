-- Ordered, user-scoped change feed for local-first desktop clients. The
-- payload is intentionally row data already visible to the owning user; it
-- lets clients apply inserts, updates and deletions without broad refetches.
CREATE TABLE IF NOT EXISTS public.desktop_sync_events (
  cursor BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('chat', 'message', 'promise', 'contact', 'preference')),
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('upsert', 'delete')),
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_desktop_sync_events_user_cursor
  ON public.desktop_sync_events(user_id, cursor);

ALTER TABLE public.desktop_sync_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read their desktop sync events" ON public.desktop_sync_events
  FOR SELECT USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.record_desktop_sync_event()
RETURNS TRIGGER AS $$
DECLARE
  source_row JSONB;
  event_user_id UUID;
  event_id TEXT;
BEGIN
  source_row := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  event_user_id := (source_row->>'user_id')::UUID;
  event_id := source_row->>'id';
  IF event_user_id IS NULL OR event_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  INSERT INTO public.desktop_sync_events(user_id, entity_type, entity_id, operation, payload)
  VALUES (
    event_user_id,
    TG_ARGV[0],
    event_id,
    CASE WHEN TG_OP = 'DELETE' THEN 'delete' ELSE 'upsert' END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE source_row END
  );
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS desktop_sync_chats ON public.chats;
CREATE TRIGGER desktop_sync_chats AFTER INSERT OR UPDATE OR DELETE ON public.chats
  FOR EACH ROW EXECUTE FUNCTION public.record_desktop_sync_event('chat');

DROP TRIGGER IF EXISTS desktop_sync_messages ON public.messages;
CREATE TRIGGER desktop_sync_messages AFTER INSERT OR UPDATE OR DELETE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.record_desktop_sync_event('message');

DROP TRIGGER IF EXISTS desktop_sync_promises ON public.promises;
CREATE TRIGGER desktop_sync_promises AFTER INSERT OR UPDATE OR DELETE ON public.promises
  FOR EACH ROW EXECUTE FUNCTION public.record_desktop_sync_event('promise');

DROP TRIGGER IF EXISTS desktop_sync_contacts ON public.contacts;
CREATE TRIGGER desktop_sync_contacts AFTER INSERT OR UPDATE OR DELETE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.record_desktop_sync_event('contact');

DROP TRIGGER IF EXISTS desktop_sync_preferences ON public.user_preferences;
CREATE TRIGGER desktop_sync_preferences AFTER INSERT OR UPDATE OR DELETE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.record_desktop_sync_event('preference');

CREATE INDEX IF NOT EXISTS idx_messages_user_chat_timestamp_id
  ON public.messages(user_id, chat_id, timestamp DESC, id DESC);
