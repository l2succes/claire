-- Privacy-safe operational state for the Claire Operations Console.
-- These tables intentionally contain no message content, contact identity,
-- provider credentials, Matrix event payloads, or raw account identifiers.

CREATE TABLE IF NOT EXISTS public.operations_component_checks (
  component TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('healthy', 'warning', 'critical', 'unknown')),
  summary TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.operations_incidents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fingerprint TEXT NOT NULL UNIQUE,
  component TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('warning', 'critical')),
  title TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  first_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  last_alerted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS operations_incidents_open_idx
  ON public.operations_incidents (status, severity, last_detected_at DESC);

ALTER TABLE public.operations_component_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operations_incidents ENABLE ROW LEVEL SECURITY;

-- The Operations Console reads through the authenticated server API. Do not
-- grant direct client access: even metadata needs an explicit staff boundary.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operations_component_checks TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operations_incidents TO service_role;
