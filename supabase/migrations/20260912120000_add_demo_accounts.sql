-- Demo accounts (filmable product demos)
--
-- A demo account carries synthetic conversations so a recorded product demo
-- never shows real messages. This flag is deliberately only half the gate: the
-- server also requires DEMO_MODE_ENABLED, so flipping this column in an
-- environment that has not opted in changes no behaviour at all.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;

-- Partial index: the demo population is a handful of rows against the whole
-- user table, and every lookup is "is this specific account a demo account?".
CREATE INDEX IF NOT EXISTS idx_users_is_demo ON public.users (id) WHERE is_demo;

COMMENT ON COLUMN public.users.is_demo IS
  'Synthetic demo account. Inert unless DEMO_MODE_ENABLED is also set on the server.';
