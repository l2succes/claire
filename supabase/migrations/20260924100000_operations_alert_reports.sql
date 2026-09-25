CREATE TABLE IF NOT EXISTS public.operations_alert_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL CHECK (event_type IN ('signup', 'platform_connected', 'platform_failed', 'server_error')),
  title text NOT NULL,
  summary text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email text,
  screen text,
  request_method text,
  request_path text,
  http_status integer,
  platform text,
  session_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS operations_alert_reports_created_at_idx
  ON public.operations_alert_reports (created_at DESC);

ALTER TABLE public.operations_alert_reports ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.operations_alert_reports TO service_role;
