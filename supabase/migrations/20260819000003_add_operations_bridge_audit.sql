-- Record read access to the metadata-only Platform Bridges module.
ALTER TABLE public.operations_audit_events DROP CONSTRAINT IF EXISTS operations_audit_events_action_check;
ALTER TABLE public.operations_audit_events ADD CONSTRAINT operations_audit_events_action_check CHECK (action IN (
  'snapshot_viewed',
  'incidents_viewed',
  'admins_viewed',
  'admin_granted',
  'admin_revoked',
  'telemetry_viewed',
  'bridges_viewed'
));
