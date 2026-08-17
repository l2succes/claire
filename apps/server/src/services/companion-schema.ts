import postgres from 'postgres';
import { config } from '../config';
import { logger } from '../utils/logger';

/**
 * Keep the companion boundary deployable with the server that consumes it.
 * The checked-in SQL migration remains the source of truth; this idempotent
 * bootstrap closes the gap for self-hosted/Railway environments where schema
 * migrations are not automatically run during a source deployment.
 */
export async function ensureCompanionSchema(): Promise<void> {
  const sql = postgres(config.DIRECT_DATABASE_URL || config.DATABASE_URL, {
    max: 1,
    connect_timeout: 10,
    idle_timeout: 2,
  });
  try {
    await sql.begin(async transaction => {
      await transaction.unsafe(`
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
      `);
    });
    logger.info('Companion device schema is ready');
  } finally {
    await sql.end({ timeout: 2 });
  }
}
