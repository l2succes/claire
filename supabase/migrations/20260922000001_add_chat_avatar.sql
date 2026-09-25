-- Conversation artwork is distinct from a participant profile photo. Group
-- notifications use this image while keeping the sender's name in the title.
ALTER TABLE public.chats
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

COMMENT ON COLUMN public.chats.avatar_url IS
  'Publicly fetchable conversation artwork, normally the provider group avatar.';
