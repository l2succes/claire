-- Live Operations telemetry is deliberately metadata-only. These constraints
-- make the database reject any attempt to turn this into a message archive.

CREATE TABLE IF NOT EXISTS public.operations_telemetry_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trace_ref TEXT NOT NULL CHECK (trace_ref ~ '^[a-f0-9]{16,64}$'),
  account_ref TEXT NOT NULL CHECK (account_ref ~ '^[a-f0-9]{16,64}$'),
  platform TEXT NOT NULL CHECK (platform IN ('whatsapp', 'telegram', 'instagram', 'imessage', 'mock')),
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound', 'system')),
  stage TEXT NOT NULL CHECK (stage IN ('provider', 'bridge', 'matrix', 'api', 'database', 'realtime', 'push', 'client_ack')),
  outcome TEXT NOT NULL CHECK (outcome IN ('accepted', 'persisted', 'published', 'acknowledged', 'failed', 'retrying', 'connected', 'disconnected')),
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  retry_count SMALLINT NOT NULL DEFAULT 0 CHECK (retry_count >= 0 AND retry_count <= 100),
  error_class TEXT CHECK (error_class IS NULL OR error_class IN ('auth', 'network', 'rate_limit', 'validation', 'dependency', 'provider', 'unknown')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS operations_telemetry_events_occurred_at_idx
  ON public.operations_telemetry_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS operations_telemetry_events_platform_stage_idx
  ON public.operations_telemetry_events (platform, stage, occurred_at DESC);
CREATE INDEX IF NOT EXISTS operations_telemetry_events_account_idx
  ON public.operations_telemetry_events (account_ref, occurred_at DESC);

ALTER TABLE public.operations_telemetry_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.operations_telemetry_events TO service_role;

ALTER TABLE public.operations_audit_events DROP CONSTRAINT IF EXISTS operations_audit_events_action_check;
ALTER TABLE public.operations_audit_events ADD CONSTRAINT operations_audit_events_action_check CHECK (action IN ('snapshot_viewed', 'incidents_viewed', 'admins_viewed', 'admin_granted', 'admin_revoked', 'telemetry_viewed'));

-- Raw operational events are short-lived. Aggregate metrics are calculated at
-- read time in this first slice; add a scheduled rollup before exceeding this
-- retention/volume envelope.
CREATE OR REPLACE FUNCTION public.purge_expired_operations_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.operations_telemetry_events WHERE occurred_at < NOW() - INTERVAL '30 days';
  DELETE FROM public.operations_incidents WHERE updated_at < NOW() - INTERVAL '365 days';
  DELETE FROM public.operations_audit_events WHERE created_at < NOW() - INTERVAL '365 days';
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_operations_data() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_expired_operations_data() TO service_role;
