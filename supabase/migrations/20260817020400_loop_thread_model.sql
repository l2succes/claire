-- Tables that turn a loop from a row into a thread of intent.
-- See docs/LOOPS_REVAMP_PLAN.md §4.

-- loop_events -----------------------------------------------------------------
-- Append-only timeline: every piece of evidence, state change, plugin action,
-- and agent note. This is what the details page renders and what makes
-- "why does Claire think this?" answerable.

CREATE TABLE IF NOT EXISTS public.loop_events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  loop_id     UUID NOT NULL REFERENCES public.loops(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN (
                'created', 'evidence', 'state_change', 'deadline_change',
                'owner_change', 'merged', 'user_edit', 'reminder_sent',
                'plugin_proposed', 'plugin_executed', 'agent_note',
                'resolved', 'reopened', 'suppressed')),
  actor       TEXT NOT NULL DEFAULT 'detector'
                CHECK (actor IN ('detector', 'user', 'agent', 'plugin', 'system')),
  message_id  UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  summary     TEXT,
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence  REAL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Events are a timeline, not a blob store. Anything larger belongs in its
  -- own table with a reference.
  CONSTRAINT loop_events_payload_size CHECK (pg_column_size(payload) < 8192)
);

CREATE INDEX IF NOT EXISTS idx_loop_events_loop
  ON public.loop_events(loop_id, occurred_at ASC, id ASC);
CREATE INDEX IF NOT EXISTS idx_loop_events_message
  ON public.loop_events(user_id, message_id) WHERE message_id IS NOT NULL;

-- Makes evidence attachment idempotent: re-running detection over an
-- overlapping window cannot attach the same message to a loop twice.
CREATE UNIQUE INDEX IF NOT EXISTS uq_loop_events_evidence
  ON public.loop_events(loop_id, message_id)
  WHERE kind = 'evidence' AND message_id IS NOT NULL;

-- loop_participants -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.loop_participants (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  loop_id      UUID NOT NULL REFERENCES public.loops(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  contact_id   UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  -- contact_id::text when resolved, else a normalized display name. Lets a
  -- participant dedupe before contact resolution has caught up.
  identity_key TEXT NOT NULL,
  is_self      BOOLEAN NOT NULL DEFAULT FALSE,
  role         TEXT NOT NULL DEFAULT 'observer'
                 CHECK (role IN ('owner', 'counterparty', 'mentioned', 'observer')),
  evidence     TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_loop_participants
  ON public.loop_participants(loop_id, identity_key);

-- chat_participants -----------------------------------------------------------
-- Materialized roster, maintained incrementally on ingest.
--
-- Claire has no participants table; the only way to derive one today is
-- DISTINCT over a chat's messages, which is far too expensive to run on every
-- detection pass. Note this counts people who have *spoken* — chats.member_count
-- is the real audience size and the two differ enormously on large channels.

CREATE TABLE IF NOT EXISTS public.chat_participants (
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  chat_id       UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  identity_key  TEXT NOT NULL,
  contact_id    UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  display_name  TEXT NOT NULL,
  phone         TEXT,
  is_self       BOOLEAN NOT NULL DEFAULT FALSE,
  message_count INTEGER NOT NULL DEFAULT 0,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, chat_id, identity_key)
);

CREATE INDEX IF NOT EXISTS idx_chat_participants_chat
  ON public.chat_participants(user_id, chat_id, last_seen_at DESC);

-- One-shot backfill from message history so existing chats are not blind until
-- new traffic arrives.
INSERT INTO public.chat_participants
  (user_id, chat_id, identity_key, contact_id, display_name, phone, is_self,
   message_count, first_seen_at, last_seen_at)
SELECT
  m.user_id,
  m.chat_id,
  COALESCE(m.contact_id::text, lower(trim(m.contact_name)), 'unknown'),
  m.contact_id,
  COALESCE(m.contact_name, 'Unknown'),
  m.contact_phone,
  FALSE,
  count(*),
  min(m.timestamp),
  max(m.timestamp)
FROM public.messages m
WHERE m.from_me = FALSE
  AND m.is_deleted = FALSE
  AND COALESCE(m.contact_name, m.contact_id::text) IS NOT NULL
GROUP BY m.user_id, m.chat_id,
         COALESCE(m.contact_id::text, lower(trim(m.contact_name)), 'unknown'),
         m.contact_id, m.contact_name, m.contact_phone
ON CONFLICT (user_id, chat_id, identity_key) DO NOTHING;

-- chat_loop_settings ----------------------------------------------------------
-- Per-chat sensitivity. Deliberately NOT a column on chat_categories: that
-- table has `category TEXT NOT NULL CHECK (...)`, so a settings row could not
-- exist without also forcing a category choice.

CREATE TABLE IF NOT EXISTS public.chat_loop_settings (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  chat_id        UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  sensitivity    TEXT NOT NULL DEFAULT 'normal'
                   CHECK (sensitivity IN ('off', 'low', 'normal', 'high')),
  min_confidence REAL CHECK (min_confidence IS NULL OR (min_confidence >= 0 AND min_confidence <= 1)),
  auto_close     BOOLEAN NOT NULL DEFAULT TRUE,
  watch_terms    TEXT[] NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, chat_id)
);

-- chat_loop_cursors -----------------------------------------------------------
-- Debounce and idempotency state for the detection pipeline.

CREATE TABLE IF NOT EXISTS public.chat_loop_cursors (
  user_id                UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  chat_id                UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  last_message_timestamp TIMESTAMPTZ,
  last_message_id        UUID,
  last_run_at            TIMESTAMPTZ,
  last_gate_result       TEXT,
  pending_since          TIMESTAMPTZ,
  -- Consecutive runs that produced no ops. Backs off the gate so a chatty but
  -- loop-free conversation stops costing model calls.
  consecutive_empty      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, chat_id)
);

-- User-level defaults ---------------------------------------------------------

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS loop_detection_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS default_group_sensitivity TEXT NOT NULL DEFAULT 'normal'
    CHECK (default_group_sensitivity IN ('off', 'low', 'normal', 'high'));

-- RLS -------------------------------------------------------------------------

ALTER TABLE public.loop_events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loop_participants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_participants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_loop_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_loop_cursors  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own loop_events" ON public.loop_events FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can manage own loop_participants" ON public.loop_participants FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can manage own chat_participants" ON public.chat_participants FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can manage own chat_loop_settings" ON public.chat_loop_settings FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can manage own chat_loop_cursors" ON public.chat_loop_cursors FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_chat_loop_settings_updated_at
  BEFORE UPDATE ON public.chat_loop_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

NOTIFY pgrst, 'reload schema';
