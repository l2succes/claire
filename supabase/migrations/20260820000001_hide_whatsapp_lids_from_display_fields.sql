-- A WhatsApp LID (`lid-…`) is an opaque bridge routing identifier, not a
-- customer name or telephone number. Older ingest paths copied it into
-- display fields; keep the durable identifier columns intact while clearing
-- only those unsafe presentation fallbacks.

UPDATE public.contacts
SET
  name = CASE WHEN lower(coalesce(name, '')) ~ '^lid[-:]?[0-9]+$' THEN NULL ELSE name END,
  phone_number = CASE WHEN lower(coalesce(phone_number, '')) ~ '^lid[-:]?[0-9]+$' THEN NULL ELSE phone_number END
WHERE platform = 'whatsapp'
  AND (
    lower(coalesce(name, '')) ~ '^lid[-:]?[0-9]+$'
    OR lower(coalesce(phone_number, '')) ~ '^lid[-:]?[0-9]+$'
  );

UPDATE public.chats
SET name = NULL
WHERE platform = 'whatsapp'
  AND lower(coalesce(name, '')) ~ '^lid[-:]?[0-9]+$';

UPDATE public.messages
SET
  contact_name = CASE WHEN lower(coalesce(contact_name, '')) ~ '^lid[-:]?[0-9]+$' THEN NULL ELSE contact_name END,
  contact_phone = CASE WHEN lower(coalesce(contact_phone, '')) ~ '^lid[-:]?[0-9]+$' THEN NULL ELSE contact_phone END
WHERE platform = 'whatsapp'
  AND (
    lower(coalesce(contact_name, '')) ~ '^lid[-:]?[0-9]+$'
    OR lower(coalesce(contact_phone, '')) ~ '^lid[-:]?[0-9]+$'
  );

