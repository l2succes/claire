-- mautrix may use the sender's full phone number as its profile display-name
-- fallback. It is useful contact detail, but it must never occupy `name`:
-- client identity rules deliberately hide phone-shaped names. Preserve the
-- canonical E.164 value in phone_number and leave the person name unknown.
UPDATE contacts
SET
  phone_number = COALESCE(
    phone_number,
    '+' || regexp_replace(regexp_replace(name, '\s*\(WA\)\s*$', '', 'i'), '[^0-9]', '', 'g')
  ),
  name = NULL
WHERE platform = 'whatsapp'
  AND name IS NOT NULL
  AND name !~ '[•*]'
  AND regexp_replace(regexp_replace(name, '\s*\(WA\)\s*$', '', 'i'), '[^0-9]', '', 'g') ~ '^[0-9]{7,15}$';
