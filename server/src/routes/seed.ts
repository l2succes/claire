/**
 * Seed / Reset route — available only in MOCK_BRIDGE mode.
 *
 * POST /seed/reset
 *   Truncates all data rows for the mock user and re-emits fixture messages
 *   so Playwright tests can start from a known state.
 *
 * GET /seed/fixtures
 *   Returns the fixture summary (counts, IDs, promise message text) for
 *   tests to assert against.
 */

import { Router, Request, Response } from 'express';
import { supabase } from '../services/supabase';
import { logger } from '../utils/logger';
import { FIXTURE_SUMMARY, MOCK_USER_ID } from '../mock-fixtures';
import { mockBridgeAdapter } from '../adapters/mock';

const router = Router();

// Guard: only serve this route in mock mode
function requireMockMode(_req: Request, res: Response, next: () => void) {
  if (process.env.MOCK_BRIDGE !== 'true') {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  next();
}

/**
 * GET /seed/fixtures
 * Return fixture metadata so e2e tests know what to assert.
 */
router.get('/fixtures', requireMockMode, (_req: Request, res: Response) => {
  res.json({ ok: true, fixtures: FIXTURE_SUMMARY });
});

/**
 * POST /seed/reset
 * Truncate mock-user data rows and replay fixture messages.
 */
router.post('/reset', requireMockMode, async (_req: Request, res: Response) => {
  try {
    logger.info('[seed] Resetting mock fixtures...');

    // Delete in dependency order (messages → ai_suggestions → promises → chats → contacts)
    await supabase.from('promises').delete().eq('user_id', MOCK_USER_ID);
    await supabase.from('ai_suggestions').delete().eq('user_id', MOCK_USER_ID);
    await supabase.from('messages').delete().eq('user_id', MOCK_USER_ID);
    await supabase.from('chats').delete().eq('user_id', MOCK_USER_ID);
    await supabase.from('contacts').delete().eq('user_id', MOCK_USER_ID);

    // Re-emit fixture messages through the adapter (same path as real ingestion)
    await mockBridgeAdapter.initialize();

    logger.info('[seed] Reset complete');
    res.json({ ok: true, fixtures: FIXTURE_SUMMARY });
  } catch (err) {
    logger.error('[seed] Reset failed:', err);
    res.status(500).json({ error: 'Seed reset failed', detail: String(err) });
  }
});

export default router;
