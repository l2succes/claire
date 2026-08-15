-- One retained, strictly-scoped Ask Claire thread per conversation. Global
-- assistant threads keep a NULL chat_id and continue to work unchanged.
ALTER TABLE public.conversation_assistant_threads
  ADD COLUMN IF NOT EXISTS chat_id UUID REFERENCES public.chats(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_assistant_threads_user_chat
  ON public.conversation_assistant_threads(user_id, chat_id)
  WHERE chat_id IS NOT NULL;

-- Product-interest records intentionally contain no platform credentials or
-- contact data. They are an authenticated user's opt-in request only.
CREATE TABLE IF NOT EXISTS public.platform_interest_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  platform_id TEXT NOT NULL CHECK (char_length(platform_id) BETWEEN 1 AND 80),
  source TEXT NOT NULL DEFAULT 'desktop' CHECK (source IN ('desktop', 'web', 'ios', 'android')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, platform_id)
);

CREATE INDEX IF NOT EXISTS idx_platform_interest_platform
  ON public.platform_interest_requests(platform_id, created_at DESC);

ALTER TABLE public.platform_interest_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own platform interest" ON public.platform_interest_requests;
CREATE POLICY "Users manage own platform interest"
  ON public.platform_interest_requests FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_platform_interest_requests_updated_at ON public.platform_interest_requests;
CREATE TRIGGER update_platform_interest_requests_updated_at
  BEFORE UPDATE ON public.platform_interest_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Strict conversation retrieval backs the desktop inspector. Unlike @mentions
-- in global Ask Claire, these functions never include secondary chat sources.
CREATE OR REPLACE FUNCTION public.search_conversation_messages_in_chat(
  query_text TEXT,
  target_user_id UUID,
  target_chat_id UUID,
  result_limit INTEGER DEFAULT 12
)
RETURNS TABLE (
  message_id UUID, chat_id UUID, content TEXT, sender_name TEXT, from_me BOOLEAN,
  "timestamp" TIMESTAMPTZ, platform TEXT, chat_name TEXT, is_group BOOLEAN, rank REAL
)
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT m.id, m.chat_id, m.content,
    COALESCE(m.contact_name, c.name, ch.name, 'Unknown'),
    m.from_me, m.timestamp, m.platform, ch.name, ch.is_group,
    ts_rank_cd(to_tsvector('simple', COALESCE(m.content, '')), websearch_to_tsquery('simple', query_text))::REAL
  FROM public.messages m
  JOIN public.chats ch ON ch.id = m.chat_id
  LEFT JOIN public.contacts c ON c.id = m.contact_id
  WHERE m.user_id = target_user_id
    AND m.chat_id = target_chat_id
    AND m.is_deleted = false
    AND COALESCE(m.content, '') <> ''
    AND to_tsvector('simple', COALESCE(m.content, '')) @@ websearch_to_tsquery('simple', query_text)
  ORDER BY 10 DESC, m.timestamp DESC
  LIMIT GREATEST(1, LEAST(result_limit, 30));
$$;

CREATE OR REPLACE FUNCTION public.match_conversation_messages_in_chat(
  query_embedding vector(1536),
  target_user_id UUID,
  target_chat_id UUID,
  result_limit INTEGER DEFAULT 12
)
RETURNS TABLE (
  message_id UUID, chat_id UUID, content TEXT, sender_name TEXT, from_me BOOLEAN,
  "timestamp" TIMESTAMPTZ, platform TEXT, chat_name TEXT, is_group BOOLEAN, similarity REAL
)
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT m.id, m.chat_id, m.content,
    COALESCE(m.contact_name, c.name, ch.name, 'Unknown'),
    m.from_me, m.timestamp, m.platform, ch.name, ch.is_group,
    (1 - (e.embedding <=> query_embedding))::REAL
  FROM public.conversation_message_embeddings e
  JOIN public.messages m ON m.id = e.message_id
  JOIN public.chats ch ON ch.id = m.chat_id
  LEFT JOIN public.contacts c ON c.id = m.contact_id
  WHERE e.user_id = target_user_id
    AND m.user_id = target_user_id
    AND m.chat_id = target_chat_id
    AND m.is_deleted = false
  ORDER BY e.embedding <=> query_embedding
  LIMIT GREATEST(1, LEAST(result_limit, 30));
$$;

NOTIFY pgrst, 'reload schema';
