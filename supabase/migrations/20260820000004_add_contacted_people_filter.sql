-- "Contacted" is intentionally deterministic: it includes a person only when
-- the Claire account owner has sent them at least one direct message. Store a
-- user-scoped counter on Contacts so People never has to pass thousands of
-- message-derived UUIDs through the API or read message content.
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS outbound_message_count INTEGER NOT NULL DEFAULT 0;

UPDATE public.contacts AS contact
SET outbound_message_count = source.count
FROM (
  SELECT contact_id, COUNT(*)::INTEGER AS count
  FROM public.messages
  WHERE from_me = TRUE AND contact_id IS NOT NULL
  GROUP BY contact_id
) AS source
WHERE contact.id = source.contact_id
  AND contact.outbound_message_count IS DISTINCT FROM source.count;

CREATE INDEX IF NOT EXISTS idx_contacts_user_outbound_messages
  ON public.contacts (user_id, name, id)
  WHERE outbound_message_count > 0 AND is_group = FALSE;

CREATE OR REPLACE FUNCTION public.maintain_contact_outbound_message_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.from_me IS NOT DISTINCT FROM NEW.from_me
    AND OLD.contact_id IS NOT DISTINCT FROM NEW.contact_id THEN
    RETURN NEW;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.from_me = TRUE AND OLD.contact_id IS NOT NULL THEN
    UPDATE public.contacts
    SET outbound_message_count = GREATEST(outbound_message_count - 1, 0)
    WHERE id = OLD.contact_id AND user_id = OLD.user_id;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.from_me = TRUE AND NEW.contact_id IS NOT NULL THEN
    UPDATE public.contacts
    SET outbound_message_count = outbound_message_count + 1
    WHERE id = NEW.contact_id AND user_id = NEW.user_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS maintain_contact_outbound_message_count ON public.messages;
CREATE TRIGGER maintain_contact_outbound_message_count
AFTER INSERT OR UPDATE OF from_me, contact_id OR DELETE ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.maintain_contact_outbound_message_count();

NOTIFY pgrst, 'reload schema';
