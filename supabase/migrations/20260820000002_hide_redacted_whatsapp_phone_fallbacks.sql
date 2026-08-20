-- mautrix can expose a privacy-preserving fallback such as +1••••••04, or a
-- full-number fallback such as +1 415 555 2671 (WA), when WhatsApp has not
-- supplied a profile name. Neither is a customer-facing name. Move canonical
-- number fallbacks to phone_number and clear presentation labels so a profile
-- name can replace them on the next bridge contact sync.

UPDATE public.contacts
SET
  phone_number = COALESCE(phone_number, regexp_replace(name, '[[:space:]]*[(]WA[)][[:space:]]*$', '')),
  name = NULL
WHERE platform = 'whatsapp'
  AND regexp_replace(name, '[[:space:]]*[(]WA[)][[:space:]]*$', '') ~ '^[+]?[0-9][0-9[:space:]().-]{6,}$';

UPDATE public.chats
SET name = NULL
WHERE platform = 'whatsapp'
  AND regexp_replace(name, '[[:space:]]*[(]WA[)][[:space:]]*$', '') ~ '^[+]?[0-9][0-9[:space:]().-]{6,}$';

UPDATE public.messages
SET contact_name = NULL
WHERE platform = 'whatsapp'
  AND regexp_replace(contact_name, '[[:space:]]*[(]WA[)][[:space:]]*$', '') ~ '^[+]?[0-9][0-9[:space:]().-]{6,}$';

UPDATE public.contacts
SET name = NULL
WHERE platform = 'whatsapp'
  AND name ~ '^[+0-9[:space:]().•*-]+$'
  AND name ~ '[•*]';

UPDATE public.chats
SET name = NULL
WHERE platform = 'whatsapp'
  AND name ~ '^[+0-9[:space:]().•*-]+$'
  AND name ~ '[•*]';

UPDATE public.messages
SET contact_name = NULL
WHERE platform = 'whatsapp'
  AND contact_name ~ '^[+0-9[:space:]().•*-]+$'
  AND contact_name ~ '[•*]';
