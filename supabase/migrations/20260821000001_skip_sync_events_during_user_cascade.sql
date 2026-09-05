-- A cascading deletion from public.users deletes chats/messages after the
-- parent profile is no longer visible. Their AFTER DELETE sync triggers must
-- not attempt to insert a desktop_sync_events row with that vanished user_id.
-- Explicit deletes while the profile still exists continue to emit events.
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

  IF TG_OP = 'DELETE' AND NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = event_user_id
  ) THEN
    RETURN OLD;
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

NOTIFY pgrst, 'reload schema';
