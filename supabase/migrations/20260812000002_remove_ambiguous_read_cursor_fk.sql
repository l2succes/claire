-- A read cursor is an application-level pointer, not a relational child of a
-- message. Keeping this FK creates two paths between messages and chats
-- (messages.chat_id -> chats.id and chats.last_read_message_id -> messages.id),
-- which makes PostgREST embeds such as `messages.select('chats(...)')`
-- ambiguous. The UUID value remains for backwards compatibility.
ALTER TABLE public.chats
  DROP CONSTRAINT IF EXISTS chats_last_read_message_id_fkey;

COMMENT ON COLUMN public.chats.last_read_message_id IS
  'Application-level read cursor. Intentionally not a foreign key so PostgREST message-to-chat embeds stay unambiguous.';

NOTIFY pgrst, 'reload schema';
