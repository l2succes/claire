-- Extend loops from "one row per detected message" to a thread of intent that
-- opens, evolves, and closes. See docs/LOOPS_REVAMP_PLAN.md §4.
--
-- Runs after the rename migration so `loops` and the new platform_type values
-- both exist.

ALTER TABLE public.loops
  -- Identity and narrative. `title` is the short imperative summary; the old
  -- `content` column becomes the fallback for legacy rows.
  ADD COLUMN IF NOT EXISTS title              TEXT,
  ADD COLUMN IF NOT EXISTS state_summary      TEXT,
  ADD COLUMN IF NOT EXISTS kind               TEXT,

  -- Who owes what. Supersedes the two-valued from_me: a loop can be owed by the
  -- user, by a counterparty, shared, or genuinely unassigned.
  ADD COLUMN IF NOT EXISTS owner              TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS owner_contact_id   UUID REFERENCES public.contacts(id) ON DELETE SET NULL,

  -- Real FKs. The legacy message_id is TEXT with no constraint, joined via
  -- messages.id::text.
  ADD COLUMN IF NOT EXISTS origin_message_id  UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS latest_message_id  UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS evidence_count     INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_evidence_at   TIMESTAMPTZ,

  -- Snooze is separate from the deadline. The old snooze endpoint overwrote
  -- `deadline`, destroying the date the user actually committed to.
  ADD COLUMN IF NOT EXISTS snoozed_until      TIMESTAMPTZ,

  -- How precisely the deadline is known, so the UI can say "this week" instead
  -- of inventing a time of day.
  ADD COLUMN IF NOT EXISTS deadline_precision TEXT NOT NULL DEFAULT 'none',

  ADD COLUMN IF NOT EXISTS resolution         TEXT,
  ADD COLUMN IF NOT EXISTS resolved_at        TIMESTAMPTZ,

  -- Why this loop was (or was not) surfaced. relevance_signals holds the full
  -- per-signal breakdown, which is what makes threshold tuning and "why didn't
  -- Claire catch this?" answerable.
  ADD COLUMN IF NOT EXISTS relevance          REAL NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS relevance_signals  JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS visibility         TEXT NOT NULL DEFAULT 'surfaced',
  ADD COLUMN IF NOT EXISTS suppressed_reason  TEXT,

  -- Dedupe and merge across restatements and platforms.
  ADD COLUMN IF NOT EXISTS dedupe_key         TEXT,
  ADD COLUMN IF NOT EXISTS merged_into_id     UUID REFERENCES public.loops(id) ON DELETE SET NULL,

  -- Provenance.
  ADD COLUMN IF NOT EXISTS source             TEXT NOT NULL DEFAULT 'detector',
  ADD COLUMN IF NOT EXISTS source_plugin_id   TEXT,
  ADD COLUMN IF NOT EXISTS detector_version   TEXT,
  ADD COLUMN IF NOT EXISTS last_detected_at   TIMESTAMPTZ,

  -- Set when a human edits a field, so the detector never silently overwrites
  -- a correction.
  ADD COLUMN IF NOT EXISTS user_edited        BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill from the legacy shape ---------------------------------------------

UPDATE public.loops SET
  kind               = COALESCE(kind, type),
  title              = COALESCE(title, LEFT(content, 140)),
  state_summary      = COALESCE(state_summary, content),
  owner              = CASE WHEN from_me THEN 'me' ELSE 'them' END,
  last_evidence_at   = COALESCE(last_evidence_at, updated_at, created_at),
  deadline_precision = CASE WHEN deadline IS NULL THEN 'none' ELSE 'day' END,
  detector_version   = COALESCE(detector_version, 'legacy-single-message');

-- Resolve the legacy TEXT pointer to a real FK where the source message still
-- exists. Rows whose source was deleted keep working with an empty timeline.
UPDATE public.loops l
SET origin_message_id = m.id
FROM public.messages m
WHERE m.id::text = l.message_id
  AND m.user_id = l.user_id
  AND l.origin_message_id IS NULL;

UPDATE public.loops SET
  resolution  = CASE status WHEN 'completed' THEN 'fulfilled'
                            WHEN 'cancelled' THEN 'user_dismissed' END,
  resolved_at = CASE WHEN status IN ('completed', 'cancelled')
                     THEN COALESCE(completed_at, updated_at) END;

-- Status vocabulary. 'overdue' becomes derived rather than stored — nothing
-- ever wrote it, and every client already recomputes it from the deadline.
UPDATE public.loops SET status = CASE status
  WHEN 'pending'   THEN 'open'
  WHEN 'overdue'   THEN 'open'
  WHEN 'completed' THEN 'done'
  WHEN 'cancelled' THEN 'dropped'
  ELSE 'open'
END;

ALTER TABLE public.loops ALTER COLUMN status SET DEFAULT 'open';

-- Constraints ----------------------------------------------------------------
-- These columns were bare TEXT documented only by a trailing comment, so
-- nothing stopped a typo from being written.

ALTER TABLE public.loops
  ADD CONSTRAINT loops_status_check CHECK (status IN
    ('open', 'waiting', 'snoozed', 'done', 'dropped', 'superseded')),
  ADD CONSTRAINT loops_owner_check CHECK (owner IN
    ('me', 'them', 'shared', 'unknown')),
  ADD CONSTRAINT loops_kind_check CHECK (kind IS NULL OR kind IN
    ('commitment', 'request', 'plan', 'deadline', 'question', 'decision',
     'task', 'appointment')),
  ADD CONSTRAINT loops_resolution_check CHECK (resolution IS NULL OR resolution IN
    ('fulfilled', 'cancelled', 'expired', 'superseded', 'merged',
     'user_dismissed', 'false_positive')),
  ADD CONSTRAINT loops_visibility_check CHECK (visibility IN
    ('surfaced', 'suppressed', 'shadow')),
  ADD CONSTRAINT loops_deadline_precision_check CHECK (deadline_precision IN
    ('exact', 'day', 'week', 'month', 'none')),
  ADD CONSTRAINT loops_source_check CHECK (source IN
    ('detector', 'user', 'plugin', 'agent')),
  ADD CONSTRAINT loops_priority_check CHECK (priority IS NULL OR priority IN
    ('low', 'medium', 'high')),
  ADD CONSTRAINT loops_relevance_range CHECK (relevance >= 0 AND relevance <= 1),
  ADD CONSTRAINT loops_title_len CHECK (title IS NULL OR char_length(title) <= 200),
  ADD CONSTRAINT loops_no_self_merge CHECK (merged_into_id IS NULL OR merged_into_id <> id);

-- Indexes --------------------------------------------------------------------

-- One live loop per (chat, normalized intent). Partial so a closed loop with the
-- same key never blocks a genuinely new one later.
CREATE UNIQUE INDEX IF NOT EXISTS uq_loops_live_dedupe
  ON public.loops(user_id, chat_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL AND status IN ('open', 'waiting', 'snoozed');

-- The list query: open loops ordered by when they next need attention.
CREATE INDEX IF NOT EXISTS idx_loops_surface
  ON public.loops(user_id, status, (COALESCE(snoozed_until, deadline)))
  WHERE visibility = 'surfaced';

-- "Which loops are live in this chat?" — asked on every detection pass.
CREATE INDEX IF NOT EXISTS idx_loops_chat_live
  ON public.loops(user_id, chat_id, status)
  WHERE status IN ('open', 'waiting', 'snoozed');

-- Reminder scheduler sweep.
CREATE INDEX IF NOT EXISTS idx_loops_due
  ON public.loops((COALESCE(snoozed_until, deadline)))
  WHERE status IN ('open', 'waiting', 'snoozed');

COMMENT ON COLUMN public.loops.message_id IS
  'DEPRECATED legacy TEXT pointer joined via messages.id::text. Use origin_message_id.';
COMMENT ON COLUMN public.loops.from_me IS
  'DEPRECATED. Superseded by the four-valued `owner`; retained one release for the desktop cache.';
COMMENT ON COLUMN public.loops.status IS
  'open | waiting | snoozed | done | dropped | superseded. Overdue is DERIVED: '
  'status IN (open, waiting) AND COALESCE(snoozed_until, deadline) < now().';

-- Realtime -------------------------------------------------------------------
-- `promises` was never added to the publication, so the mobile badge''s
-- postgres_changes subscription has never fired. It only updated on remount.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'loops'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.loops;
  END IF;
END
$$;

ALTER TABLE public.loops REPLICA IDENTITY FULL;

NOTIFY pgrst, 'reload schema';
