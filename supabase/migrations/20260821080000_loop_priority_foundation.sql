-- Requester and priority are separate from the existing next-action owner.
ALTER TABLE public.loops
  ADD COLUMN IF NOT EXISTS requester TEXT NOT NULL DEFAULT 'unknown'
    CHECK (requester IN ('me', 'them', 'shared', 'unknown')),
  ADD COLUMN IF NOT EXISTS requester_contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS priority_score SMALLINT NOT NULL DEFAULT 0
    CHECK (priority_score BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS priority_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (pg_column_size(priority_breakdown) < 4096),
  ADD COLUMN IF NOT EXISTS priority_override SMALLINT
    CHECK (priority_override BETWEEN -25 AND 25),
  ADD COLUMN IF NOT EXISTS priority_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_loops_attention_queue
  ON public.loops(user_id, priority_score DESC, last_evidence_at DESC NULLS LAST)
  WHERE visibility = 'surfaced' AND status IN ('open', 'waiting');

NOTIFY pgrst, 'reload schema';
