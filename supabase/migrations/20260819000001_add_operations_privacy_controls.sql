-- Operational records must remain metadata-only. This audit trail uses keyed
-- pseudonymous references rather than staff email addresses or customer IDs.

CREATE TABLE IF NOT EXISTS public.operations_audit_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_ref TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('snapshot_viewed', 'incidents_viewed', 'admins_viewed', 'admin_granted', 'admin_revoked')),
  target_ref TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS operations_audit_events_created_at_idx
  ON public.operations_audit_events (created_at DESC);

ALTER TABLE public.operations_audit_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.operations_audit_events TO service_role;

-- Current component checks are overwritten in place; incidents and audit
-- events are retained for 365 days. A production maintenance job calls this.
CREATE OR REPLACE FUNCTION public.purge_expired_operations_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.operations_incidents WHERE updated_at < NOW() - INTERVAL '365 days';
  DELETE FROM public.operations_audit_events WHERE created_at < NOW() - INTERVAL '365 days';
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_operations_data() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_expired_operations_data() TO service_role;
