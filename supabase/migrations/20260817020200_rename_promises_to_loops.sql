-- Rename promises -> loops.
--
-- "Loops" has been the user-facing name since the product chrome rename; the
-- database, API, and desktop app still said "promises". This closes that split
-- rather than carrying it forward.
--
-- Renaming in place (not create-and-copy) preserves row ids, RLS, indexes, and
-- the desktop sync trigger wiring. There is deliberately no `promises`
-- compatibility view: both the status vocabulary and the row semantics change
-- in the next migration, so a view would misreport both, could not carry the
-- sync trigger, and would need security_invoker to avoid bypassing RLS.
--
-- See docs/LOOPS_REVAMP_PLAN.md §4.

ALTER TABLE public.promises RENAME TO loops;

-- Constraint names are load-bearing, not cosmetic: PostgREST embed hints name
-- them explicitly (e.g. `contacts!promises_contact_id_fkey`), so leaving them
-- would break every joined query the moment the client is updated.
ALTER TABLE public.loops RENAME CONSTRAINT promises_pkey TO loops_pkey;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'promises_user_id_fkey') THEN
    ALTER TABLE public.loops RENAME CONSTRAINT promises_user_id_fkey TO loops_user_id_fkey;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'promises_chat_id_fkey') THEN
    ALTER TABLE public.loops RENAME CONSTRAINT promises_chat_id_fkey TO loops_chat_id_fkey;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'promises_contact_id_fkey') THEN
    ALTER TABLE public.loops RENAME CONSTRAINT promises_contact_id_fkey TO loops_contact_id_fkey;
  END IF;
END $$;

ALTER INDEX IF EXISTS public.idx_promises_user_status RENAME TO idx_loops_user_status;
ALTER INDEX IF EXISTS public.idx_promises_deadline    RENAME TO idx_loops_deadline;
ALTER INDEX IF EXISTS public.idx_promises_platform    RENAME TO idx_loops_platform;
-- Added by the people/search migration, which runs just before this one. The
-- index follows the table rename automatically but keeps its old name.
ALTER INDEX IF EXISTS public.idx_promises_content_trgm RENAME TO idx_loops_content_trgm;

DROP POLICY IF EXISTS "Users can manage own promises" ON public.loops;
CREATE POLICY "Users can manage own loops" ON public.loops FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- updated_at trigger follows the table rename but keeps its old name.
DROP TRIGGER IF EXISTS update_promises_updated_at ON public.loops;
CREATE TRIGGER update_loops_updated_at
  BEFORE UPDATE ON public.loops
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Desktop sync. 'promise' stays in the allowed set so historical rows keep
-- validating; new rows are emitted as 'loop'. The desktop client must ship a
-- consumer that understands both before this lands in production.
ALTER TABLE public.desktop_sync_events
  DROP CONSTRAINT IF EXISTS desktop_sync_events_entity_type_check;
ALTER TABLE public.desktop_sync_events
  ADD CONSTRAINT desktop_sync_events_entity_type_check
  CHECK (entity_type IN ('chat', 'message', 'promise', 'loop', 'contact', 'preference'));

DROP TRIGGER IF EXISTS desktop_sync_promises ON public.loops;
CREATE TRIGGER desktop_sync_loops
  AFTER INSERT OR UPDATE OR DELETE ON public.loops
  FOR EACH ROW EXECUTE FUNCTION public.record_desktop_sync_event('loop');

NOTIFY pgrst, 'reload schema';
