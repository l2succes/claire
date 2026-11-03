-- Platform sessions are created and updated only by the server (service role).
-- Clients keep read access to their own rows; writes from anon/authenticated
-- are no longer permitted.

DROP POLICY IF EXISTS "Users can manage own platform sessions" ON public.platform_sessions;
DROP POLICY IF EXISTS "Users can view own platform sessions" ON public.platform_sessions;

CREATE POLICY "Users can view own platform sessions"
  ON public.platform_sessions FOR SELECT
  USING (auth.uid() = user_id);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.platform_sessions FROM anon, authenticated;
