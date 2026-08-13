-- Global Ask Claire assistant: user-isolated hybrid retrieval and saved threads.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.conversation_message_embeddings (
  message_id UUID PRIMARY KEY REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content_hash TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversation_embeddings_user
  ON public.conversation_message_embeddings(user_id, indexed_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_embeddings_vector
  ON public.conversation_message_embeddings USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS public.conversation_assistant_index_state (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'indexing', 'ready', 'failed')),
  indexed_count INTEGER NOT NULL DEFAULT 0,
  total_count INTEGER NOT NULL DEFAULT 0,
  last_indexed_at TIMESTAMPTZ,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.conversation_assistant_threads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New conversation',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assistant_threads_user_updated
  ON public.conversation_assistant_threads(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.conversation_assistant_turns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id UUID NOT NULL REFERENCES public.conversation_assistant_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  citations JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assistant_turns_thread_created
  ON public.conversation_assistant_turns(thread_id, created_at ASC);

ALTER TABLE public.conversation_message_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_assistant_index_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_assistant_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_assistant_turns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own conversation embeddings"
  ON public.conversation_message_embeddings FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can manage own assistant index state"
  ON public.conversation_assistant_index_state FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can manage own assistant threads"
  ON public.conversation_assistant_threads FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can manage own assistant turns"
  ON public.conversation_assistant_turns FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Exact retrieval stays useful while vectors are still backfilling.
CREATE OR REPLACE FUNCTION public.search_conversation_messages(
  query_text TEXT,
  target_user_id UUID,
  result_limit INTEGER DEFAULT 12
)
RETURNS TABLE (
  message_id UUID,
  chat_id UUID,
  content TEXT,
  sender_name TEXT,
  from_me BOOLEAN,
  timestamp TIMESTAMPTZ,
  platform TEXT,
  chat_name TEXT,
  is_group BOOLEAN,
  rank REAL
)
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT
    m.id, m.chat_id, m.content,
    COALESCE(m.contact_name, c.name, ch.name, 'Unknown') AS sender_name,
    m.from_me, m.timestamp, m.platform, ch.name, ch.is_group,
    ts_rank_cd(to_tsvector('simple', COALESCE(m.content, '')), websearch_to_tsquery('simple', query_text)) AS rank
  FROM public.messages m
  JOIN public.chats ch ON ch.id = m.chat_id
  LEFT JOIN public.contacts c ON c.id = m.contact_id
  WHERE m.user_id = target_user_id
    AND m.is_deleted = false
    AND COALESCE(m.content, '') <> ''
    AND to_tsvector('simple', COALESCE(m.content, '')) @@ websearch_to_tsquery('simple', query_text)
  ORDER BY rank DESC, m.timestamp DESC
  LIMIT GREATEST(1, LEAST(result_limit, 30));
$$;

CREATE OR REPLACE FUNCTION public.match_conversation_messages(
  query_embedding vector(1536),
  target_user_id UUID,
  result_limit INTEGER DEFAULT 12
)
RETURNS TABLE (
  message_id UUID,
  chat_id UUID,
  content TEXT,
  sender_name TEXT,
  from_me BOOLEAN,
  timestamp TIMESTAMPTZ,
  platform TEXT,
  chat_name TEXT,
  is_group BOOLEAN,
  similarity REAL
)
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT
    m.id, m.chat_id, m.content,
    COALESCE(m.contact_name, c.name, ch.name, 'Unknown') AS sender_name,
    m.from_me, m.timestamp, m.platform, ch.name, ch.is_group,
    (1 - (e.embedding <=> query_embedding))::REAL AS similarity
  FROM public.conversation_message_embeddings e
  JOIN public.messages m ON m.id = e.message_id
  JOIN public.chats ch ON ch.id = m.chat_id
  LEFT JOIN public.contacts c ON c.id = m.contact_id
  WHERE e.user_id = target_user_id
    AND m.user_id = target_user_id
    AND m.is_deleted = false
  ORDER BY e.embedding <=> query_embedding
  LIMIT GREATEST(1, LEAST(result_limit, 30));
$$;

-- Idempotent/resumable backfill selector. Rows already indexed with the same
-- content hash are skipped by the service before any embedding API call.
CREATE OR REPLACE FUNCTION public.get_unembedded_conversation_messages(
  target_user_id UUID,
  result_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  content TEXT,
  contact_name TEXT,
  from_me BOOLEAN,
  timestamp TIMESTAMPTZ,
  platform TEXT
)
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT m.id, m.user_id, m.content, m.contact_name, m.from_me, m.timestamp, m.platform
  FROM public.messages m
  LEFT JOIN public.conversation_message_embeddings e ON e.message_id = m.id
  WHERE m.user_id = target_user_id
    AND m.is_deleted = false
    AND COALESCE(m.content, '') <> ''
    AND e.message_id IS NULL
  ORDER BY m.timestamp ASC
  LIMIT GREATEST(1, LEAST(result_limit, 250));
$$;
