import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { supabase, type DbRow } from '../services/supabase';
import { logger } from '../utils/logger';

const router = Router();

const syncSchema = z.object({
  query: z.object({
    cursor: z.coerce.number().int().min(0).default(0),
    limit: z.coerce.number().int().min(1).max(500).default(250),
  }),
});

/**
 * Small startup snapshot. Timelines and original media deliberately stay out
 * of this response: the desktop cache hydrates those independently.
 */
router.get('/bootstrap', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id as string;
    const [chatsResult, loopsResult, preferencesResult, cursorResult] = await Promise.all([
      supabase.from('chats').select('*, contact:contacts(*)').eq('user_id', userId).order('last_message_at', { ascending: false, nullsFirst: false }),
      supabase.from('loops').select('*, contact:contacts(*), chat:chats(*)').eq('user_id', userId).in('status', ['open', 'waiting', 'snoozed']).order('updated_at', { ascending: false }).limit(200),
      supabase.from('user_preferences').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('desktop_sync_events').select('cursor').eq('user_id', userId).order('cursor', { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (chatsResult.error) throw chatsResult.error;
    if (loopsResult.error) throw loopsResult.error;
    if (preferencesResult.error) throw preferencesResult.error;
    if (cursorResult.error) throw cursorResult.error;

    const chats = chatsResult.data || [];
    const latestByChat = new Map<string, Record<string, unknown>>();
    if (chats.length) {
      // One row per conversation, straight from the feed view.
      //
      // This used to select every message the account had ever received --
      // no limit, ordered by timestamp -- and then discard all but the newest
      // per chat in JavaScript. On a real account that is the entire message
      // history transferred and parsed on every cold start that finds an empty
      // cache. conversation_feed already denormalises the latest message onto
      // each chat through an indexed lateral join, which is the same answer
      // for a bounded number of rows.
      const { data: feed, error } = await supabase
        .from('conversation_feed')
        .select('chat_id, last_message_id, last_message_content, last_message_content_type, last_message_media_mime_type, last_message_from_me, last_message_at')
        .eq('user_id', userId)
        .not('last_message_id', 'is', null);
      if (error) throw error;
      for (const row of feed || []) {
        if (!row.chat_id || !row.last_message_id) continue;
        latestByChat.set(row.chat_id, {
          id: row.last_message_id,
          chat_id: row.chat_id,
          content: row.last_message_content,
          content_type: row.last_message_content_type,
          media_mime_type: row.last_message_media_mime_type,
          from_me: row.last_message_from_me,
          timestamp: row.last_message_at,
        });
      }
    }

    res.json({
      cursor: cursorResult.data?.cursor || 0,
      chats: chats.map((chat: DbRow) => ({ ...chat, latest_message: latestByChat.get(chat.id) || null })),
      loops: loopsResult.data || [],
      preferences: preferencesResult.data || null,
    });
  } catch (error) {
    logger.error('Failed to build desktop bootstrap:', error);
    res.status(500).json({ error: 'Failed to load desktop bootstrap.' });
  }
});

router.get('/sync', requireAuth, validateRequest(syncSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id as string;
    const { cursor, limit } = req.query as unknown as { cursor: number; limit: number };
    const { data, error } = await supabase
      .from('desktop_sync_events')
      .select('cursor, entity_type, entity_id, operation, payload, created_at')
      .eq('user_id', userId)
      .gt('cursor', cursor)
      .order('cursor', { ascending: true })
      .limit(limit);
    if (error) throw error;
    const events = data || [];
    res.json({ events, cursor: events.at(-1)?.cursor || cursor, hasMore: events.length === limit });
  } catch (error) {
    logger.error('Failed to sync desktop changes:', error);
    res.status(500).json({ error: 'Failed to sync desktop changes.' });
  }
});

export default router;
