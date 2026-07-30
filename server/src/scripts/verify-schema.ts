#!/usr/bin/env bun
/**
 * Pre-deploy schema-drift check (#99).
 *
 * Exits non-zero if the live database is missing any column/table the
 * application requires, so a deploy can be gated before incompatible code
 * serves traffic. Uses the same Supabase env as the server.
 *
 * Usage: bun run verify:schema
 */
import { verifySchema } from '../services/schema-verification';
import { logger } from '../utils/logger';

async function main(): Promise<void> {
  const result = await verifySchema();

  if (result.ok) {
    logger.info(`[schema] OK — ${result.checkedTables} tables verified`);
    // eslint-disable-next-line no-console
    console.log(`✅ schema OK (${result.checkedTables} tables verified)`);
    process.exit(0);
  }

  // eslint-disable-next-line no-console
  console.error('❌ SCHEMA DRIFT DETECTED — the database is behind the deployed code:');
  for (const entry of result.drift) {
    // eslint-disable-next-line no-console
    console.error(`   - ${entry.table} (${entry.columns.join(', ')}): ${entry.error}`);
  }
  // eslint-disable-next-line no-console
  console.error('\nApply pending migrations before deploying (see docs/SCHEMA_VERIFICATION.md).');
  process.exit(1);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[schema] verification could not run:', err);
  process.exit(2);
});
