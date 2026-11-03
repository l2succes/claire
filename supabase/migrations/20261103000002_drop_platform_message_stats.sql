-- Unused aggregate view. It was created without security_invoker, so it did
-- not apply the querying user's row-level security.
DROP VIEW IF EXISTS public.platform_message_stats;
