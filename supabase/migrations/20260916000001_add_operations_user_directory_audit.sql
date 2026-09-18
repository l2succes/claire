-- Reading signup emails is restricted to Operations owners in the API and is
-- recorded separately from metadata-only dashboard reads.
ALTER TABLE public.operations_audit_events DROP CONSTRAINT IF EXISTS operations_audit_events_action_check;
ALTER TABLE public.operations_audit_events ADD CONSTRAINT operations_audit_events_action_check CHECK (action IN (
  'snapshot_viewed',
  'incidents_viewed',
  'admins_viewed',
  'admin_granted',
  'admin_revoked',
  'telemetry_viewed',
  'bridges_viewed',
  'bridge_session_retired',
  'users_viewed'
));
