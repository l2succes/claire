#!/bin/bash
set -e

# Set passwords for all Supabase service accounts
# Uses POSTGRES_PASSWORD from environment (defaults to 'postgres')
PASSWORD="${POSTGRES_PASSWORD:-postgres}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    ALTER ROLE authenticator WITH PASSWORD '$PASSWORD';
    ALTER ROLE supabase_admin WITH PASSWORD '$PASSWORD';
    ALTER ROLE supabase_auth_admin WITH PASSWORD '$PASSWORD';
    ALTER ROLE supabase_storage_admin WITH PASSWORD '$PASSWORD';
    ALTER ROLE dashboard_user WITH PASSWORD '$PASSWORD';
    ALTER ROLE supabase_replication_admin WITH PASSWORD '$PASSWORD';
    ALTER ROLE supabase_read_only_user WITH PASSWORD '$PASSWORD';
EOSQL

echo "Supabase role passwords set successfully"
