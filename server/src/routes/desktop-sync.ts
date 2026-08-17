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
    const chatIds = chats.map((chat: DbRow) => chat.id);
    const latestByChat = new Map<string, Record<string, unknown>>();
    if (chatIds.length) {
      const { data: latest, error } = await supabase
        .from('messages')
        .select('id, chat_id, content, content_type, media_mime_type, timestamp, from_me')
        .eq('user_id', userId)
        .in('chat_id', chatIds)
        .order('timestamp', { ascending: false });
      if (error) throw error;
      for (const message of latest || []) if (message.chat_id && !latestByChat.has(message.chat_id)) latestByChat.set(message.chat_id, message);
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
