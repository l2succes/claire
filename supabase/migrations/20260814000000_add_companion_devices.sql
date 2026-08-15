-- A desktop companion is a first-class, revocable host. The stored token is
-- a SHA-256 digest only; the raw device credential is returned once at enrolment
-- and belongs in Keychain/Credential Locker, never in this database.
CREATE TABLE IF NOT EXISTS public.companion_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 120),
  host_platform TEXT NOT NULL CHECK (host_platform IN ('macos', 'windows')),
  public_key TEXT NOT NULL CHECK (char_length(public_key) BETWEEN 32 AND 8192),
  credential_hash TEXT NOT NULL,
  credential_rotated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, public_key)
);

CREATE INDEX IF NOT EXISTS idx_companion_devices_user_status
  ON public.companion_devices (user_id, status, last_seen_at DESC);

ALTER TABLE public.companion_devices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own companion devices" ON public.companion_devices;
CREATE POLICY "Users manage own companion devices"
  ON public.companion_devices FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_companion_devices_updated_at ON public.companion_devices;
CREATE TRIGGER update_companion_devices_updated_at
  BEFORE UPDATE ON public.companion_devices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

NOTIFY pgrst, 'reload schema';
