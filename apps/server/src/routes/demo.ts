/**
 * Demo account seeding routes
 *
 * Seeding runs inside the server rather than in a standalone script for one
 * reason: it replays fixtures through `platformManager.ingestMessage`, the same
 * entry point a real bridge event uses. Loops, the Ask Claire index, contact
 * resolution and chat ordering are therefore produced by the real pipeline, so
 * a demo shows the actual product rather than rows shaped to look like it.
 *
 * Every route here 404s unless the caller is themselves a demo account, so the
 * surface is invisible to real users and can only ever touch its own data.
 */

import { Router, Request, Response } from 'express';

import { platformManager } from '../adapters';
import { requireAuth } from '../middleware/auth';
import { buildDemoMessages, demoFixtureSummary } from '../demo/fixtures';
import { DEMO_PERSONAS, FILMABLE_SURFACES } from '../demo/personas';
import { isDemoUser } from '../demo/demo-accounts';
import { countTrailingIncoming } from '../demo/unread';
import { aiProcessor } from '../services/ai-processor';
import { isAiProcessingEnabled } from '../services/ai-policy';
import { scheduleChat } from '../services/loops/loop-queue';
import { supabase, type DbRow } from '../services/supabase';
import { logger } from '../utils/logger';

const router = Router();

/**
 * Tables wiped by a reset, in dependency order.
 *
 * Assistant state is included deliberately: leaving stale embeddings or threads
 * behind would let Ask Claire cite messages that no longer exist, which is
 * exactly the kind of thing that ruins a take.
 */
const RESET_TABLES = [
  'conversation_assistant_turns',
  'conversation_assistant_threads',
  'conversation_assistant_index_state',
  'conversation_message_embeddings',
  'smart_cards',
  'loop_events',
  'loop_participants',
  'loops',
  'ai_suggestions',
  'auto_reply_log',
  'message_reactions',
  'chat_loop_cursors',
  'chat_loop_settings',
  'chat_participants',
  'contact_memory',
  'messages',
  'chats',
  'contacts',
] as const;

/**
 * Demo-only gate. Responds 404 rather than 403: a real account should not be
 * able to learn that this surface exists.
 */
async function requireDemoAccount(req: Request, res: Response, next: () => void) {
  const userId = req.user?.id;
  if (!userId || !(await isDemoUser(userId))) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  next();
}

// ─── Status ────────────────────────────────────────────────────────────────

router.get('/status', requireAuth, requireDemoAccount, async (req: Request, res: Response) => {
  const userId = req.user?.id as string;
  const [messages, chats, loops] = await Promise.all([
    supabase.from('messages').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('chats').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('loops').select('id', { count: 'exact', head: true }).eq('user_id', userId),
  ]);

  res.json({
    ok: true,
    account: { userId, isDemo: true },
    fixtures: demoFixtureSummary(),
    stored: {
      messages: messages.count ?? 0,
      chats: chats.count ?? 0,
      loops: loops.count ?? 0,
    },
    filmableSurfaces: FILMABLE_SURFACES,
  });
});

// ─── Seed ──────────────────────────────────────────────────────────────────

router.post('/seed', requireAuth, requireDemoAccount, async (req: Request, res: Response) => {
  const userId = req.user?.id as string;
  try {
    const result = await seedDemoAccount(userId);
    res.json({ ok: true, ...result });
  } catch (error) {
    logger.error('[demo] Seed failed', error);
    res.status(500).json({ error: 'Demo seed failed', detail: String(error) });
  }
});

router.post('/reset', requireAuth, requireDemoAccount, async (req: Request, res: Response) => {
  const userId = req.user?.id as string;
  try {
    const wiped = await wipeDemoAccount(userId);
    const result = await seedDemoAccount(userId);
    res.json({ ok: true, wiped, ...result });
  } catch (error) {
    logger.error('[demo] Reset failed', error);
    res.status(500).json({ error: 'Demo reset failed', detail: String(error) });
  }
});

// ─── Implementation ────────────────────────────────────────────────────────

/**
 * Delete this account's conversation data.
 *
 * A missing table is tolerated: the demo tooling should still work against a
 * database that predates one of the newer features rather than failing wholesale.
 */
async function wipeDemoAccount(userId: string): Promise<string[]> {
  const wiped: string[] = [];
  for (const table of RESET_TABLES) {
    const { error } = await supabase.from(table).delete().eq('user_id', userId);
    if (error) {
      logger.warn(`[demo] Skipped ${table} during reset`, { code: error.code });
      continue;
    }
    wiped.push(table);
  }
  return wiped;
}

interface SeedResult {
  seededMessages: number;
  chats: number;
  suggestionsRequested: number;
  loopDetectionScheduled: number;
}

async function seedDemoAccount(userId: string): Promise<SeedResult> {
  const now = new Date();
  const messages = buildDemoMessages(userId, now);

  logger.info(`[demo] Replaying ${messages.length} fixture messages for demo account`);

  // Sequential on purpose. Ingestion resolves reply references and advances
  // each chat's last_message_at as it goes, so replaying concurrently would
  // leave the inbox ordered by whichever write happened to land last.
  for (const message of messages) {
    await platformManager.ingestMessage(message);
  }

  await applyPersonaAvatars(userId);

  const aiEnabled = await isAiProcessingEnabled(userId);
  const { data: chatRows, error } = await supabase
    .from('chats')
    .select('id, platform, platform_chat_id, is_group')
    .eq('user_id', userId);
  if (error) throw error;

  let suggestionsRequested = 0;
  let loopDetectionScheduled = 0;

  for (const chat of (chatRows || []) as DbRow[]) {
    const tail = await loadChatTail(userId, chat.id);

    // Unread badges are restored here rather than during ingestion: the replay
    // runs as backfill (no push storm), so the unread state has to be derived.
    // An unanswered run of incoming messages at the end of a thread is exactly
    // what a real unread count is.
    const trailingIncoming = countTrailingIncoming(tail);
    if (trailingIncoming > 0) {
      await supabase
        .from('chats')
        .update({ unread_count: trailingIncoming, last_read_at: null, last_read_message_id: null })
        .eq('id', chat.id)
        .eq('user_id', userId);
    }

    // One fresh suggestion per chat, for its newest incoming message. Backfill
    // deliberately generates none, and a suggestion for every historical
    // message would be both expensive and pointless.
    const newestIncoming = tail.filter((row) => !row.from_me).at(-1);
    if (aiEnabled && aiProcessor.isConfigured && newestIncoming?.content?.trim()) {
      suggestionsRequested += 1;
      void aiProcessor
        .generateAndStore(
          newestIncoming.id,
          newestIncoming.content,
          userId,
          chat.is_group ? 'group' : 'individual'
        )
        .catch((err) => logger.debug('[demo] Suggestion skipped', { error: (err as Error).message }));
    }

    // Loop detection is skipped for backfill, so the seed asks for it directly.
    // Without this the account would have no loops, which is half the demo.
    loopDetectionScheduled += 1;
    void scheduleChat(userId, chat.id).catch((err) =>
      logger.debug('[demo] Loop detection skipped', { error: (err as Error).message })
    );
  }

  logger.info('[demo] Seed complete', {
    messages: messages.length,
    chats: chatRows?.length ?? 0,
  });

  return {
    seededMessages: messages.length,
    chats: chatRows?.length ?? 0,
    suggestionsRequested,
    loopDetectionScheduled,
  };
}

/** The last stretch of a chat, oldest first. */
async function loadChatTail(userId: string, chatId: string): Promise<DbRow[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('id, content, from_me, timestamp')
    .eq('user_id', userId)
    .eq('chat_id', chatId)
    .order('timestamp', { ascending: false })
    .limit(12);
  if (error) {
    logger.warn('[demo] Could not read chat tail', { code: error.code });
    return [];
  }
  return (data || []).reverse() as DbRow[];
}

/**
 * Ingestion learns names from bridge events but never avatars, so the persona
 * portraits are applied directly. Without this every demo contact renders as
 * initials, which reads as an empty account on camera.
 */
async function applyPersonaAvatars(userId: string): Promise<void> {
  for (const persona of DEMO_PERSONAS) {
    const { error } = await supabase
      .from('contacts')
      .update({ avatar_url: persona.avatarUrl })
      .eq('user_id', userId)
      .eq('platform', persona.platform)
      .eq('platform_contact_id', persona.platformContactId);
    if (error) {
      logger.debug('[demo] Could not set persona avatar', { persona: persona.key, code: error.code });
    }
  }
}

export default router;
