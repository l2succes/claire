-- People had a long tail of rows that lead nowhere.
--
-- WhatsApp's bridge produces contacts that are pure residue: a profile name of
-- a single character, no number, no username, and no conversation. They sort
-- into the A–Z index like real people, and tapping one opens a screen with
-- nothing on it. On a large account there are enough of them to pad the
-- directory walk with round trips that carry nothing anyone can use.
--
-- The client already hides them, but only after paying to fetch them. This
-- view moves the cheap, unambiguous part of that decision into the database so
-- the walk is smaller.
--
-- The rule here is deliberately STRICTER than the client's: it may only mark a
-- row the client would also hide. Anything ambiguous is left for the client,
-- which has the full display logic (bridge LIDs, privacy masks, chat-envelope
-- name fallbacks). A row wrongly marked here disappears from People with no
-- way for the user to find it, so the asymmetry is the whole point.
--
-- The NOT EXISTS is the load-bearing clause: a contact with a conversation is
-- always kept, however useless its name, because the chat is somewhere to go.

-- The NOT EXISTS below probes chats by contact. Without this it degrades into a
-- sequential scan per contact, which on a 21,000-row directory is exactly the
-- cost this view was meant to remove.
CREATE INDEX IF NOT EXISTS idx_chats_contact_user
  ON public.chats(contact_id, user_id)
  WHERE contact_id IS NOT NULL;

DROP VIEW IF EXISTS public.people_directory;

CREATE VIEW public.people_directory
WITH (security_invoker = true) AS
SELECT
  c.id,
  c.user_id,
  c.name,
  c.phone_number,
  c.platform_contact_id,
  c.avatar_url,
  c.inferred_name,
  c.inferred_relationship,
  c.is_group,
  c.platform,
  c.username,
  c.notes,
  c.outbound_message_count,
  (
    c.is_group IS NOT TRUE
    -- No number, and none derivable. The API synthesizes a phone from a plain
    -- digit JID for older imports, so that has to be excluded here too or this
    -- view would hide contacts the client goes on to display a number for.
    -- A LID ("lid-123…") does not match, and so stays removable.
    AND NULLIF(BTRIM(COALESCE(c.phone_number, '')), '') IS NULL
    AND split_part(COALESCE(c.platform_contact_id, ''), '@', 1) !~ '^\+?\d{7,15}$'
    AND NULLIF(BTRIM(COALESCE(c.username, '')), '') IS NULL
    -- Both names, not just the displayed one: a contact called "A" with an
    -- inferred name of "Ada Lovelace" is identifiable and must survive.
    AND char_length(BTRIM(COALESCE(c.name, ''))) <= 1
    AND char_length(BTRIM(COALESCE(c.inferred_name, ''))) <= 1
    AND NOT EXISTS (
      SELECT 1
      FROM public.chats ch
      WHERE ch.contact_id = c.id
        AND ch.user_id = c.user_id
    )
  ) AS is_dead_end
FROM public.contacts c;

COMMENT ON VIEW public.people_directory IS
  'Contacts for the People screen, with is_dead_end marking rows that identify '
  'nobody and lead nowhere: no number, username, usable name, or conversation. '
  'Intentionally stricter than the client rule, which stays authoritative.';

GRANT SELECT ON public.people_directory TO authenticated;
GRANT SELECT ON public.people_directory TO service_role;
