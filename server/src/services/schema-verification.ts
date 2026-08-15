/**
 * Database schema-drift verification (#99).
 *
 * Production once ran healthy while the Supabase schema was behind the deployed
 * code (a missing `messages.snoozed_until` column had to be added by hand). This
 * module declares the columns the running application requires and checks them
 * against the live database, so drift is reported explicitly (via /health) and
 * can gate a deploy (via the `verify:schema` script) instead of surfacing as
 * runtime 500s.
 *
 * Detection is RLS-safe: a missing column/table yields a Postgres/PostgREST
 * "undefined column/table" error regardless of row-level security, whereas a
 * present-but-empty table simply returns no rows (no error).
 */

import { supabase } from './supabase';
import { logger } from '../utils/logger';

export interface SchemaRequirement {
  table: string;
  columns: string[];
}

/**
 * Columns the application reads or writes. Extend this whenever a migration adds
 * a column/table the code depends on — that keeps drift detection honest.
 * Only include columns that exist once ALL migrations are applied.
 */
export const REQUIRED_SCHEMA: SchemaRequirement[] = [
  { table: 'messages', columns: ['snoozed_until', 'is_group', 'contact_name', 'contact_phone', 'media_mime_type'] },
  { table: 'chats', columns: ['whatsapp_chat_id', 'last_message_at'] },
  { table: 'contacts', columns: ['inferred_relationship', 'inference_confidence'] },
  { table: 'ai_suggestions', columns: ['selected_index', 'feedback'] },
  { table: 'push_tokens', columns: ['token', 'device_id'] },
  { table: 'notification_devices', columns: ['device_id', 'provider', 'token', 'enabled', 'timezone', 'last_seen_at'] },
  { table: 'notification_deliveries', columns: ['device_id', 'message_id', 'state', 'attempts', 'provider_receipt_id'] },
  { table: 'auto_reply_rules', columns: ['trigger_type', 'reply_template'] },
  { table: 'contact_memory', columns: ['key', 'value', 'confidence'] },
  { table: 'chat_categories', columns: ['category'] },
  { table: 'contact_profiles', columns: ['key_facts'] },
  { table: 'smart_cards', columns: ['dismissed'] },
  { table: 'conversation_assistant_threads', columns: ['user_id', 'chat_id', 'updated_at'] },
  { table: 'conversation_assistant_turns', columns: ['thread_id', 'scope_chat_ids', 'citations'] },
  { table: 'platform_interest_requests', columns: ['user_id', 'platform_id', 'source'] },
];

export interface SchemaDriftEntry {
  table: string;
  columns: string[];
  error: string;
}

export interface SchemaVerificationResult {
  ok: boolean;
  checkedTables: number;
  drift: SchemaDriftEntry[];
}

// Postgres error codes for a missing column / relation.
const UNDEFINED_COLUMN = '42703';
const UNDEFINED_TABLE = '42P01';

interface SupabaseErrorLike {
  code?: string;
  message?: string;
}

/**
 * True only for errors that mean the schema is missing something — not for
 * transient/operational errors (network, auth), which must NOT be reported as
 * drift.
 */
export function isMissingSchemaError(error: SupabaseErrorLike | null | undefined): boolean {
  if (!error) return false;
  const code = error.code ?? '';
  if (code === UNDEFINED_COLUMN || code === UNDEFINED_TABLE) return true;
  // PostgREST schema-cache codes: PGRST204 (unknown column), PGRST205 (unknown table).
  if (code === 'PGRST204' || code === 'PGRST205') return true;
  const message = (error.message ?? '').toLowerCase();
  return message.includes('does not exist') || message.includes('could not find the');
}

/**
 * Verify the live database exposes every required table/column.
 * One lightweight query per table (selecting all required columns, limit 1).
 */
export async function verifySchema(
  requirements: SchemaRequirement[] = REQUIRED_SCHEMA
): Promise<SchemaVerificationResult> {
  const drift: SchemaDriftEntry[] = [];

  for (const { table, columns } of requirements) {
    const { error } = await supabase.from(table).select(columns.join(',')).limit(1);
    if (isMissingSchemaError(error)) {
      drift.push({ table, columns, error: error?.message ?? 'missing table or column' });
    } else if (error) {
      // Operational error — log but don't claim drift (avoids false readiness failures).
      logger.warn(`[schema] Non-schema error probing ${table}: ${error.message}`);
    }
  }

  return { ok: drift.length === 0, checkedTables: requirements.length, drift };
}

// Schema only changes on deploy/migration, so a short TTL keeps /health cheap
// even under frequent readiness polling.
let cache: { at: number; result: SchemaVerificationResult } | null = null;

export async function verifySchemaCached(ttlMs = 60_000): Promise<SchemaVerificationResult> {
  const now = Date.now();
  if (cache && now - cache.at < ttlMs) return cache.result;
  const result = await verifySchema();
  cache = { at: now, result };
  return result;
}

/** Clear the cached verification (used by tests / after a migration run). */
export function resetSchemaVerificationCache(): void {
  cache = null;
}
