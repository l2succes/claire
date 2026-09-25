ALTER TABLE public.platform_sessions
  ADD COLUMN IF NOT EXISTS operations_retired_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS operations_retired_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_platform_sessions_operations_active
  ON public.platform_sessions(user_id, platform, status)
  WHERE operations_retired_at IS NULL;

COMMENT ON COLUMN public.platform_sessions.operations_retired_at IS
  'Operations-only retirement marker. Retired historical sessions do not affect bridge health.';

COMMENT ON COLUMN public.platform_sessions.operations_retired_by IS
  'Authenticated Operations owner who retired the historical session from health monitoring.';
