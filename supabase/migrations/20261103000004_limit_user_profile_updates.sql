-- Owners may edit only their display fields. Account fields such as email and
-- the demo flag are maintained by the server (service role).
REVOKE UPDATE ON public.users FROM anon, authenticated;
GRANT UPDATE (name, avatar_url, updated_at) ON public.users TO authenticated;
