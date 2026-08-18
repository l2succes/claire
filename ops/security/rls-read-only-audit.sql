-- Read-only production/staging RLS and privilege audit.
-- Run through a privileged operator connection; this file makes no changes.

-- Tables accessible through the PostgREST-exposed schemas and whether RLS is
-- enabled/forced. Every application table containing user data should be RLS
-- enabled, and user-owned rows must have a policy with both USING and WITH
-- CHECK guards tied to auth.uid().
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'p')
  AND n.nspname IN ('public', 'storage', 'realtime')
ORDER BY n.nspname, c.relname;

-- Policies must be reviewed for user isolation, including write-side
-- with_check expressions. This reports definitions, without exposing data.
SELECT
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual AS using_expression,
  with_check AS with_check_expression
FROM pg_policies
WHERE schemaname IN ('public', 'storage', 'realtime')
ORDER BY schemaname, tablename, policyname;

-- Any application-facing table with no policies deserves an explicit review.
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policies p ON p.schemaname = n.nspname AND p.tablename = c.relname
WHERE c.relkind IN ('r', 'p')
  AND n.nspname IN ('public', 'storage', 'realtime')
  AND p.policyname IS NULL
ORDER BY n.nspname, c.relname;

-- Application roles must not have broad table privileges outside the intended
-- API schema. Review grants before changing them so service-role workflows
-- remain functional.
SELECT
  table_schema,
  table_name,
  grantee,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema IN ('public', 'storage', 'realtime')
  AND grantee IN ('anon', 'authenticated', 'service_role')
ORDER BY table_schema, table_name, grantee, privilege_type;

-- SECURITY DEFINER functions require a locked search_path and controlled
-- execute grants. Do not change a function from this report without a staging
-- test, because auth and storage workflows can depend on them.
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  p.prosecdef AS security_definer,
  p.proconfig AS function_config,
  array_to_string(p.proacl, E'\n') AS access_control_list
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public', 'storage', 'auth')
ORDER BY n.nspname, p.proname;
