-- Claire voice summaries and per-turn Ask Claire scope. No source message text is
-- copied into these rows: profiles hold only user-editable aggregate guidance.
CREATE TABLE IF NOT EXISTS public.user_voice_profiles (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  language TEXT NOT NULL,
  profile TEXT NOT NULL DEFAULT '',
  source_message_count INTEGER NOT NULL DEFAULT 0,
  source_hash TEXT,
  pending_message_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'building', 'ready', 'failed', 'stale')),
  last_error TEXT,
  generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, language)
);

ALTER TABLE public.user_voice_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own voice profiles" ON public.user_voice_profiles;
CREATE POLICY "Users manage own voice profiles"
  ON public.user_voice_profiles FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.contact_profiles
  ADD COLUMN IF NOT EXISTS ai_instruction TEXT;
ALTER TABLE public.contact_profiles
  DROP CONSTRAINT IF EXISTS contact_profiles_ai_instruction_length;
ALTER TABLE public.contact_profiles
  ADD CONSTRAINT contact_profiles_ai_instruction_length
  CHECK (ai_instruction IS NULL OR char_length(ai_instruction) <= 1500);

ALTER TABLE public.conversation_assistant_turns
  ADD COLUMN IF NOT EXISTS scope_chat_ids UUID[] NOT NULL DEFAULT '{}'::uuid[];
CREATE INDEX IF NOT EXISTS idx_assistant_turns_scope_chat_ids
  ON public.conversation_assistant_turns USING gin (scope_chat_ids);

-- Tagged chats are given an explicit score boost but global evidence remains
-- searchable. This keeps @Name useful without hiding material cross-chat facts.
CREATE OR REPLACE FUNCTION public.search_scoped_conversation_messages(
  query_text TEXT,
  target_user_id UUID,
  preferred_chat_ids UUID[] DEFAULT '{}'::uuid[],
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
    (ts_rank_cd(to_tsvector('simple', COALESCE(m.content, '')), websearch_to_tsquery('simple', query_text))
      + CASE WHEN m.chat_id = ANY(preferred_chat_ids) THEN 2.0 ELSE 0 END)::REAL
  FROM public.messages m
  JOIN public.chats ch ON ch.id = m.chat_id
  LEFT JOIN public.contacts c ON c.id = m.contact_id
  WHERE m.user_id = target_user_id AND m.is_deleted = false
    AND COALESCE(m.content, '') <> ''
    AND to_tsvector('simple', COALESCE(m.content, '')) @@ websearch_to_tsquery('simple', query_text)
  ORDER BY 10 DESC, m.timestamp DESC
  LIMIT GREATEST(1, LEAST(result_limit, 30));
$$;

CREATE OR REPLACE FUNCTION public.match_scoped_conversation_messages(
  query_embedding vector(1536),
  target_user_id UUID,
  preferred_chat_ids UUID[] DEFAULT '{}'::uuid[],
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
    ((1 - (e.embedding <=> query_embedding)) + CASE WHEN m.chat_id = ANY(preferred_chat_ids) THEN 2.0 ELSE 0 END)::REAL
  FROM public.conversation_message_embeddings e
  JOIN public.messages m ON m.id = e.message_id
  JOIN public.chats ch ON ch.id = m.chat_id
  LEFT JOIN public.contacts c ON c.id = m.contact_id
  WHERE e.user_id = target_user_id AND m.user_id = target_user_id AND m.is_deleted = false
  ORDER BY 10 DESC, m.timestamp DESC
  LIMIT GREATEST(1, LEAST(result_limit, 30));
$$;

NOTIFY pgrst, 'reload schema';
