-- Supabase Roles Initialization
-- This script creates all the necessary roles for Supabase services
-- Based on official Supabase self-hosting configuration

-- Get password from environment (defaults to 'postgres')
\set postgres_password `echo "${POSTGRES_PASSWORD:-postgres}"`

-- Create roles with proper privileges
DO $$
BEGIN
    -- Create anon role (for unauthenticated API access)
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN NOINHERIT;
    END IF;

    -- Create authenticated role (for authenticated API access)
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN NOINHERIT;
    END IF;

    -- Create service_role (for service-level access)
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
    END IF;

    -- Create authenticator role (for PostgREST)
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticator') THEN
        CREATE ROLE authenticator NOINHERIT LOGIN;
    END IF;

    -- Create supabase_admin (for internal admin operations)
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_admin') THEN
        CREATE ROLE supabase_admin LOGIN CREATEROLE CREATEDB REPLICATION BYPASSRLS;
    END IF;

    -- Create supabase_auth_admin (for GoTrue auth service)
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
        CREATE ROLE supabase_auth_admin NOINHERIT CREATEROLE LOGIN;
    END IF;

    -- Create supabase_storage_admin (for Storage service)
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_storage_admin') THEN
        CREATE ROLE supabase_storage_admin NOINHERIT CREATEROLE LOGIN;
    END IF;

    -- Create dashboard_user (for Studio)
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'dashboard_user') THEN
        CREATE ROLE dashboard_user NOINHERIT CREATEROLE LOGIN;
    END IF;

    -- Create supabase_replication_admin (for realtime)
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_replication_admin') THEN
        CREATE ROLE supabase_replication_admin LOGIN REPLICATION;
    END IF;

    -- Create supabase_read_only_user (for read replicas)
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_read_only_user') THEN
        CREATE ROLE supabase_read_only_user NOINHERIT LOGIN BYPASSRLS;
    END IF;

    -- Create pgsodium_keyiduser for pgsodium extension
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'pgsodium_keyiduser') THEN
        CREATE ROLE pgsodium_keyiduser NOLOGIN NOINHERIT;
    END IF;

    -- Create pgsodium_keyholder for pgsodium extension
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'pgsodium_keyholder') THEN
        CREATE ROLE pgsodium_keyholder NOLOGIN NOINHERIT;
    END IF;

    -- Create pgsodium_keymaker for pgsodium extension
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'pgsodium_keymaker') THEN
        CREATE ROLE pgsodium_keymaker NOLOGIN NOINHERIT;
    END IF;
END
$$;

-- Grant role memberships
GRANT anon TO authenticator;
GRANT authenticated TO authenticator;
GRANT service_role TO authenticator;
GRANT supabase_admin TO authenticator;

-- Grant necessary permissions to authenticator
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;

-- Grant supabase_admin permissions
GRANT ALL PRIVILEGES ON DATABASE postgres TO supabase_admin;
GRANT ALL ON SCHEMA public TO supabase_admin;
GRANT ALL ON ALL TABLES IN SCHEMA public TO supabase_admin;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO supabase_admin;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO supabase_admin;

-- Create auth schema for GoTrue
CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION supabase_auth_admin;
GRANT USAGE ON SCHEMA auth TO supabase_auth_admin;
GRANT ALL ON SCHEMA auth TO supabase_auth_admin;

-- Grant supabase_auth_admin permissions
GRANT ALL PRIVILEGES ON DATABASE postgres TO supabase_auth_admin;
GRANT ALL ON SCHEMA public TO supabase_auth_admin;
GRANT ALL ON ALL TABLES IN SCHEMA public TO supabase_auth_admin;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO supabase_auth_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO supabase_auth_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO supabase_auth_admin;

-- Create storage schema for Storage API
CREATE SCHEMA IF NOT EXISTS storage AUTHORIZATION supabase_storage_admin;
GRANT USAGE ON SCHEMA storage TO supabase_storage_admin;
GRANT ALL ON SCHEMA storage TO supabase_storage_admin;

-- Grant supabase_storage_admin permissions
GRANT ALL PRIVILEGES ON DATABASE postgres TO supabase_storage_admin;
GRANT ALL ON SCHEMA public TO supabase_storage_admin;
GRANT ALL ON ALL TABLES IN SCHEMA public TO supabase_storage_admin;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO supabase_storage_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO supabase_storage_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO supabase_storage_admin;

-- Create realtime schema
CREATE SCHEMA IF NOT EXISTS _realtime;
GRANT USAGE ON SCHEMA _realtime TO supabase_admin;
GRANT ALL ON SCHEMA _realtime TO supabase_admin;

-- Create extensions schema
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;

-- Extensions are pre-installed in the Supabase image
-- Just grant usage permissions

-- Set search path for convenience
ALTER DATABASE postgres SET search_path TO public, extensions;

-- Output success message
DO $$ BEGIN RAISE NOTICE 'Supabase roles and schemas initialized successfully'; END $$;
