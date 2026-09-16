-- Repair the People "Contacted" filter.
--
-- `contacts.outbound_message_count` is maintained from messages where
-- `from_me = TRUE AND contact_id IS NOT NULL` (20260820000004). But ingest only
-- ever resolved a contact for the *incoming* sender, so every row the account
-- owner sent carried contact_id = NULL. The counter therefore never left zero
-- and the filter could not return anyone: measured on production, 3,780
-- outbound messages, none of them linked.
--
-- Ingest now links an outbound 1:1 message to the chat's own contact. This
-- repairs the rows already stored.

-- In a 1:1 the counterpart is unambiguous: the chat's linked contact. Groups
-- are excluded on purpose -- "contacted" is defined as direct messages only.
UPDATE public.messages AS m
SET contact_id = c.contact_id
FROM public.chats AS c
WHERE m.chat_id = c.id
  AND m.user_id = c.user_id
  AND m.from_me = TRUE
  AND m.contact_id IS NULL
  AND c.is_group = FALSE
  AND c.contact_id IS NOT NULL;

-- Recompute with the same aggregate the trigger keeps live, so the stored
-- counter and the trigger's arithmetic agree from here on.
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

NOTIFY pgrst, 'reload schema';
