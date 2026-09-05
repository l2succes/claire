-- People is now fetched a page at a time and searched by the server. These
-- indexes keep its per-user filtering and the global substring search from
-- degrading as imported contact/message history grows.
CREATE INDEX IF NOT EXISTS idx_contacts_user_platform_name
  ON public.contacts (user_id, platform, name, id);

CREATE INDEX IF NOT EXISTS idx_contacts_user_relationship
  ON public.contacts (user_id, is_group, inferred_relationship);

CREATE INDEX IF NOT EXISTS idx_contacts_name_trgm
  ON public.contacts USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_contacts_inferred_name_trgm
  ON public.contacts USING gin (inferred_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_contacts_phone_number_trgm
  ON public.contacts USING gin (phone_number gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_contacts_username_trgm
  ON public.contacts USING gin (username gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_messages_content_trgm
  ON public.messages USING gin (content gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_promises_content_trgm
  ON public.promises USING gin (content gin_trgm_ops);
