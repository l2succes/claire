-- Keep stale-loop review decisions durable without treating elapsed time as
-- proof that an agreed commitment was completed.

ALTER TABLE public.loops
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.loops.reviewed_at IS
  'Last time the user deliberately kept this stale loop open. New evidence clears it.';

CREATE INDEX IF NOT EXISTS idx_loops_review_queue
  ON public.loops(user_id, last_evidence_at)
  WHERE visibility = 'surfaced'
    AND status IN ('open', 'waiting', 'snoozed')
    AND thread_state IN ('pending_confirmation', 'agreed');

NOTIFY pgrst, 'reload schema';
