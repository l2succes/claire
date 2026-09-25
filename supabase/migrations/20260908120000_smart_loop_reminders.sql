-- Deterministic, revision-aware loop reminder plans.
ALTER TABLE public.loops
  ADD COLUMN IF NOT EXISTS next_reminder_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_plan_state TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reminder_reason TEXT,
  ADD COLUMN IF NOT EXISTS reminder_revision INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS reminder_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.loops
  DROP CONSTRAINT IF EXISTS loops_reminder_plan_state_check,
  ADD CONSTRAINT loops_reminder_plan_state_check
    CHECK (reminder_plan_state IN ('pending', 'scheduled', 'quiet', 'sent')),
  DROP CONSTRAINT IF EXISTS loops_reminder_reason_check,
  ADD CONSTRAINT loops_reminder_reason_check
    CHECK (reminder_reason IS NULL OR reminder_reason IN
      ('snooze_ended', 'act_now', 'deadline_soon', 'follow_up'));

CREATE INDEX IF NOT EXISTS idx_loops_pending_reminder_plan
  ON public.loops(user_id, updated_at)
  WHERE reminder_plan_state = 'pending';

CREATE INDEX IF NOT EXISTS idx_loops_scheduled_reminders
  ON public.loops(next_reminder_at)
  WHERE reminder_plan_state = 'scheduled';

-- Every meaningful semantic change gets a fresh plan. Narrative/evidence-only
-- updates do not generate another interruption.
CREATE OR REPLACE FUNCTION public.invalidate_loop_reminder_plan()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.reminder_plan_state := 'pending';
    NEW.next_reminder_at := NULL;
    NEW.reminder_reason := NULL;
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status
    OR OLD.visibility IS DISTINCT FROM NEW.visibility
    OR OLD.owner IS DISTINCT FROM NEW.owner
    OR OLD.thread_state IS DISTINCT FROM NEW.thread_state
    OR OLD.deadline IS DISTINCT FROM NEW.deadline
    OR OLD.deadline_precision IS DISTINCT FROM NEW.deadline_precision
    OR OLD.snoozed_until IS DISTINCT FROM NEW.snoozed_until
    OR ((OLD.priority_score >= 80) IS DISTINCT FROM (NEW.priority_score >= 80))
    OR OLD.priority_override IS DISTINCT FROM NEW.priority_override
  THEN
    NEW.reminder_revision := OLD.reminder_revision + 1;
    NEW.reminder_plan_state := 'pending';
    NEW.next_reminder_at := NULL;
    NEW.reminder_reason := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS loops_invalidate_reminder_plan ON public.loops;
CREATE TRIGGER loops_invalidate_reminder_plan
BEFORE INSERT OR UPDATE ON public.loops
FOR EACH ROW EXECUTE FUNCTION public.invalidate_loop_reminder_plan();

ALTER TABLE public.notification_deliveries
  ADD COLUMN IF NOT EXISTS loop_id UUID REFERENCES public.loops(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subject_revision INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.notification_deliveries
  DROP CONSTRAINT IF EXISTS notification_deliveries_loop_revision_key,
  ADD CONSTRAINT notification_deliveries_loop_revision_key
    UNIQUE(loop_id, device_id, notification_type, subject_revision);

NOTIFY pgrst, 'reload schema';
