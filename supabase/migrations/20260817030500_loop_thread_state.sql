-- The thread-of-intent state.
--
-- The earlier migration added `state_summary` (the human narrative) but no
-- column for how settled the plan actually is. That distinction is what keeps
-- "we should catch up sometime" out of the Open count while "Wednesday at 3,
-- see you then" drives a calendar action.
--
-- Separate from `status`: status is workflow (open/waiting/snoozed/done),
-- thread_state is agreement (proposed -> negotiating -> pending_confirmation ->
-- agreed -> resolved). A loop can be `open` and merely `proposed`.
--
-- See /docs/plans/loops-revamp §5.

ALTER TABLE public.loops
  ADD COLUMN IF NOT EXISTS thread_state TEXT NOT NULL DEFAULT 'agreed';

-- Existing rows came from the single-message detector, which only ever produced
-- already-settled commitments. 'agreed' is the honest reading of that history
-- and keeps them actionable, which is why it is also the column default.
-- Guarded so a re-run after a partial failure is clean; the ADD COLUMN above is
-- already IF NOT EXISTS and the two should behave the same way.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'loops_thread_state_check'
  ) THEN
    ALTER TABLE public.loops
      ADD CONSTRAINT loops_thread_state_check CHECK (thread_state IN
        ('proposed', 'negotiating', 'pending_confirmation', 'agreed', 'resolved'));
  END IF;
END
$$;

-- The list query filters out unsettled loops, so it needs to be cheap.
CREATE INDEX IF NOT EXISTS idx_loops_actionable
  ON public.loops(user_id, status, thread_state)
  WHERE visibility = 'surfaced' AND status IN ('open', 'waiting', 'snoozed');

COMMENT ON COLUMN public.loops.thread_state IS
  'Agreement state: proposed | negotiating | pending_confirmation | agreed | resolved. '
  'Only agreed and later are actionable. Distinct from `status`, which is workflow.';

NOTIFY pgrst, 'reload schema';
