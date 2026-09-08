-- Ask Claire v2: durable requests, temporal hybrid retrieval, cheaper indexing,
-- and relationship-memory primitives. All query functions remain user scoped.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.conversation_assistant_turns
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS request_id UUID,
  ADD COLUMN IF NOT EXISTS query_plan JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS prompt_version TEXT,
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS model TEXT,
  ADD COLUMN IF NOT EXISTS finish_reason TEXT,
  ADD COLUMN IF NOT EXISTS input_tokens INTEGER,
  ADD COLUMN IF NOT EXISTS output_tokens INTEGER,
  ADD COLUMN IF NOT EXISTS error_code TEXT;

ALTER TABLE public.conversation_assistant_turns
  DROP CONSTRAINT IF EXISTS conversation_assistant_turns_status_check;
ALTER TABLE public.conversation_assistant_turns
  ADD CONSTRAINT conversation_assistant_turns_status_check
  CHECK (status IN ('pending', 'streaming', 'completed', 'failed', 'cancelled'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_assistant_turns_request_id
  ON public.conversation_assistant_turns(user_id, request_id)
  WHERE request_id IS NOT NULL AND role = 'assistant';

ALTER TABLE public.conversation_message_embeddings
  ADD COLUMN IF NOT EXISTS embedding_model TEXT,
  ADD COLUMN IF NOT EXISTS embedding_dimensions INTEGER NOT NULL DEFAULT 1536;

-- Makes lexical retrieval use an index rather than recomputing every document
-- vector for every Ask Claire request.
CREATE INDEX IF NOT EXISTS idx_messages_content_fts
  ON public.messages USING gin (to_tsvector('simple', COALESCE(content, '')))
  WHERE is_deleted = false AND content IS NOT NULL AND content <> '';

-- Start a request atomically. Replaying a request_id returns the existing pair
-- instead of charging for a duplicate model call or persisting duplicate turns.
CREATE OR REPLACE FUNCTION public.begin_conversation_assistant_request(
  target_user_id UUID,
  target_thread_id UUID,
  target_request_id UUID,
  question_text TEXT,
  scope_ids UUID[] DEFAULT '{}'::uuid[],
  planned_query JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (user_turn_id UUID, assistant_turn_id UUID, replayed BOOLEAN)
LANGUAGE plpgsql SET search_path = public
AS $$
DECLARE
  existing_assistant UUID;
  new_user_turn UUID;
  new_assistant_turn UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_assistant_threads
    WHERE id = target_thread_id AND user_id = target_user_id
  ) THEN
    RAISE EXCEPTION 'ASSISTANT_THREAD_NOT_FOUND';
  END IF;

  SELECT id INTO existing_assistant
  FROM public.conversation_assistant_turns
  WHERE user_id = target_user_id
    AND thread_id = target_thread_id
    AND role = 'assistant'
    AND request_id = target_request_id;

  IF existing_assistant IS NOT NULL THEN
    SELECT id INTO new_user_turn
    FROM public.conversation_assistant_turns
    WHERE user_id = target_user_id
      AND thread_id = target_thread_id
      AND role = 'user'
      AND request_id = target_request_id
    LIMIT 1;
    RETURN QUERY SELECT new_user_turn, existing_assistant, TRUE;
    RETURN;
  END IF;

  INSERT INTO public.conversation_assistant_turns
    (thread_id, user_id, role, content, citations, actions, scope_chat_ids,
     status, request_id, query_plan)
  VALUES
    (target_thread_id, target_user_id, 'user', question_text, '[]'::jsonb,
     '[]'::jsonb, scope_ids, 'completed', target_request_id, planned_query)
  RETURNING id INTO new_user_turn;

  INSERT INTO public.conversation_assistant_turns
    (thread_id, user_id, role, content, citations, actions, scope_chat_ids,
     status, request_id, query_plan)
  VALUES
    (target_thread_id, target_user_id, 'assistant', '', '[]'::jsonb,
     '[]'::jsonb, scope_ids, 'pending', target_request_id, planned_query)
  RETURNING id INTO new_assistant_turn;

  RETURN QUERY SELECT new_user_turn, new_assistant_turn, FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_conversation_assistant_request(
  target_user_id UUID,
  target_thread_id UUID,
  target_request_id UUID,
  answer_text TEXT,
  answer_citations JSONB DEFAULT '[]'::jsonb,
  answer_actions JSONB DEFAULT '[]'::jsonb,
  final_status TEXT DEFAULT 'completed',
  prompt_name TEXT DEFAULT NULL,
  provider_name TEXT DEFAULT NULL,
  model_name TEXT DEFAULT NULL,
  stop_reason TEXT DEFAULT NULL,
  prompt_tokens INTEGER DEFAULT NULL,
  completion_tokens INTEGER DEFAULT NULL,
  failure_code TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SET search_path = public
AS $$
DECLARE updated_turn UUID;
BEGIN
  UPDATE public.conversation_assistant_turns
  SET content = answer_text,
      citations = answer_citations,
      actions = answer_actions,
      status = final_status,
      prompt_version = prompt_name,
      provider = provider_name,
      model = model_name,
      finish_reason = stop_reason,
      input_tokens = prompt_tokens,
      output_tokens = completion_tokens,
      error_code = failure_code
  WHERE user_id = target_user_id
    AND thread_id = target_thread_id
    AND role = 'assistant'
    AND request_id = target_request_id
  RETURNING id INTO updated_turn;

  UPDATE public.conversation_assistant_threads
  SET title = CASE
        WHEN title = 'New conversation' THEN LEFT(question.content, 72)
        ELSE title
      END,
      updated_at = NOW()
  FROM public.conversation_assistant_turns question
  WHERE public.conversation_assistant_threads.id = target_thread_id
    AND public.conversation_assistant_threads.user_id = target_user_id
    AND question.thread_id = target_thread_id
    AND question.user_id = target_user_id
    AND question.role = 'user'
    AND question.request_id = target_request_id;

  RETURN updated_turn;
END;
$$;

CREATE OR REPLACE FUNCTION public.search_conversation_messages_v2(
  query_text TEXT,
  target_user_id UUID,
  preferred_chat_ids UUID[] DEFAULT '{}'::uuid[],
  strict_chat_id UUID DEFAULT NULL,
  range_start TIMESTAMPTZ DEFAULT NULL,
  range_end TIMESTAMPTZ DEFAULT NULL,
  result_limit INTEGER DEFAULT 24
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
      + CASE WHEN m.chat_id = ANY(preferred_chat_ids) THEN 0.15 ELSE 0 END)::REAL
  FROM public.messages m
  JOIN public.chats ch ON ch.id = m.chat_id
  LEFT JOIN public.contacts c ON c.id = m.contact_id
  WHERE m.user_id = target_user_id
    AND (strict_chat_id IS NULL OR m.chat_id = strict_chat_id)
    AND m.is_deleted = false
    AND COALESCE(m.content, '') <> ''
    AND (range_start IS NULL OR m.timestamp >= range_start)
    AND (range_end IS NULL OR m.timestamp < range_end)
    AND to_tsvector('simple', COALESCE(m.content, '')) @@ websearch_to_tsquery('simple', query_text)
  ORDER BY 10 DESC, m.timestamp DESC
  LIMIT GREATEST(1, LEAST(result_limit, 60));
$$;

CREATE OR REPLACE FUNCTION public.match_conversation_messages_v2(
  query_embedding vector(1536),
  target_user_id UUID,
  preferred_chat_ids UUID[] DEFAULT '{}'::uuid[],
  strict_chat_id UUID DEFAULT NULL,
  range_start TIMESTAMPTZ DEFAULT NULL,
  range_end TIMESTAMPTZ DEFAULT NULL,
  minimum_similarity REAL DEFAULT 0.22,
  result_limit INTEGER DEFAULT 24
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
    ((1 - (e.embedding <=> query_embedding))
      + CASE WHEN m.chat_id = ANY(preferred_chat_ids) THEN 0.03 ELSE 0 END)::REAL
  FROM public.conversation_message_embeddings e
  JOIN public.messages m ON m.id = e.message_id
  JOIN public.chats ch ON ch.id = m.chat_id
  LEFT JOIN public.contacts c ON c.id = m.contact_id
  WHERE e.user_id = target_user_id
    AND m.user_id = target_user_id
    AND (strict_chat_id IS NULL OR m.chat_id = strict_chat_id)
    AND m.is_deleted = false
    AND (range_start IS NULL OR m.timestamp >= range_start)
    AND (range_end IS NULL OR m.timestamp < range_end)
    AND (1 - (e.embedding <=> query_embedding)) >= minimum_similarity
  ORDER BY e.embedding <=> query_embedding
  LIMIT GREATEST(1, LEAST(result_limit, 60));
$$;

-- Changed messages are selected too; the service hashes the exact embedding
-- input and batches only stale rows into one embedMany call.
CREATE OR REPLACE FUNCTION public.get_stale_conversation_messages(
  target_user_id UUID,
  result_limit INTEGER DEFAULT 256
)
RETURNS TABLE (
  id UUID, user_id UUID, content TEXT, contact_name TEXT, from_me BOOLEAN,
  "timestamp" TIMESTAMPTZ, platform TEXT, stored_content_hash TEXT
)
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT m.id, m.user_id, m.content, m.contact_name, m.from_me, m.timestamp,
         m.platform, e.content_hash
  FROM public.messages m
  LEFT JOIN public.conversation_message_embeddings e ON e.message_id = m.id
  WHERE m.user_id = target_user_id
    AND m.is_deleted = false
    AND COALESCE(m.content, '') <> ''
    AND (
      e.message_id IS NULL OR e.content_hash IS DISTINCT FROM encode(digest(
        'Platform: ' || COALESCE(m.platform, 'unknown') || E'\nSender: ' ||
        CASE WHEN m.from_me THEN 'You' ELSE COALESCE(m.contact_name, 'Contact') END ||
        E'\nMessage: ' || COALESCE(m.content, ''),
        'sha256'
      ), 'hex')
    )
  ORDER BY m.timestamp ASC
  LIMIT GREATEST(1, LEAST(result_limit, 512));
$$;

CREATE TABLE IF NOT EXISTS public.assistant_relationship_metrics (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  interaction_count_30d INTEGER NOT NULL DEFAULT 0,
  interaction_count_90d INTEGER NOT NULL DEFAULT 0,
  sent_count_90d INTEGER NOT NULL DEFAULT 0,
  received_count_90d INTEGER NOT NULL DEFAULT 0,
  last_interaction_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, chat_id)
);

ALTER TABLE public.assistant_relationship_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own assistant relationship metrics" ON public.assistant_relationship_metrics;
CREATE POLICY "Users manage own assistant relationship metrics"
  ON public.assistant_relationship_metrics FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.refresh_assistant_relationship_metrics(target_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  INSERT INTO public.assistant_relationship_metrics (
    user_id, chat_id, interaction_count_30d, interaction_count_90d,
    sent_count_90d, received_count_90d, last_interaction_at, updated_at
  )
  SELECT target_user_id, ch.id,
    COUNT(m.id) FILTER (WHERE m.timestamp >= NOW() - INTERVAL '30 days')::INTEGER,
    COUNT(m.id) FILTER (WHERE m.timestamp >= NOW() - INTERVAL '90 days')::INTEGER,
    COUNT(m.id) FILTER (WHERE m.timestamp >= NOW() - INTERVAL '90 days' AND m.from_me)::INTEGER,
    COUNT(m.id) FILTER (WHERE m.timestamp >= NOW() - INTERVAL '90 days' AND NOT m.from_me)::INTEGER,
    MAX(m.timestamp), NOW()
  FROM public.chats ch
  LEFT JOIN public.messages m ON m.chat_id = ch.id
    AND m.user_id = target_user_id AND m.is_deleted = false
  WHERE ch.user_id = target_user_id AND ch.is_group = false
  GROUP BY ch.id
  ON CONFLICT (user_id, chat_id) DO UPDATE SET
    interaction_count_30d = EXCLUDED.interaction_count_30d,
    interaction_count_90d = EXCLUDED.interaction_count_90d,
    sent_count_90d = EXCLUDED.sent_count_90d,
    received_count_90d = EXCLUDED.received_count_90d,
    last_interaction_at = EXCLUDED.last_interaction_at,
    updated_at = NOW();
END;
$$;

NOTIFY pgrst, 'reload schema';
