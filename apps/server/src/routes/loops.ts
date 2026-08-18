import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { supabase, type DbRow } from '../services/supabase';
import { validateRequest } from '../middleware/validation';
import { requireAuth } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();

type LoopConversationRow = {
  id: string;
  message_id?: string | null;
  chat_id?: string | null;
  contact_name?: string | null;
  platform?: string | null;
  contact?: unknown;
  chat?: unknown;
  [key: string]: unknown;
};

async function hydrateLoopConversations(userId: string, rows: LoopConversationRow[]) {
  const messageIds = [...new Set(rows.map((row) => row.message_id).filter((id): id is string => Boolean(id)))];
  if (!messageIds.length) return rows;

  const { data: sources, error } = await supabase
    .from('messages')
    .select(`
      id, chat_id, contact_name, platform,
      contact:contacts!messages_contact_id_fkey(name, inferred_name, avatar_url),
      chat:chats!messages_chat_id_fkey(
        name, is_group, platform,
        contact:contacts!chats_contact_id_fkey(name, inferred_name, avatar_url)
      )
    `)
    .eq('user_id', userId)
    .in('id', messageIds);
  if (error) throw error;

  const byMessageId = new Map<string, DbRow>(
    (sources || []).map((source: DbRow) => [source.id as string, source]),
  );
  return rows.map((row) => {
    const source = row.message_id ? byMessageId.get(row.message_id) : null;
    if (!source) return row;
    const sourceChat = source.chat as { contact?: unknown } | null;
    return {
      ...row,
      chat_id: row.chat_id || source.chat_id,
      contact_name: row.contact_name || source.contact_name,
      platform: row.platform || source.platform,
      contact: source.contact || sourceChat?.contact || row.contact || null,
      chat: source.chat || row.chat || null,
    };
  });
}

// ---- Schema validators ----

const listLoopsSchema = z.object({
  query: z.object({
    status: z.enum(['open', 'waiting', 'snoozed', 'done', 'dropped']).optional(),
    platform: z.string().optional(),
    contact_id: z.string().uuid().optional(),
    limit: z.string().optional().transform(val => val ? Math.min(parseInt(val, 10), 200) : 50),
    offset: z.string().optional().transform(val => val ? parseInt(val, 10) : 0),
  }),
});

const updateLoopSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid loop ID'),
  }),
  body: z.object({
    status: z.enum(['open', 'waiting', 'snoozed', 'done', 'dropped']).optional(),
    notes: z.string().optional(),
    deadline: z.string().datetime().optional(),
    priority: z.enum(['low', 'medium', 'high']).optional(),
  }).refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  }),
});

const createLoopSchema = z.object({
  body: z.object({
    content: z.string().trim().min(1).max(1_000),
    deadline: z.string().datetime().nullable().optional(),
    priority: z.enum(['low', 'medium', 'high']).optional().default('medium'),
    chat_id: z.string().uuid().nullable().optional(),
  }),
});

const snoozeLoopSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid loop ID'),
  }),
  body: z.object({
    snooze_until: z.string().datetime('snooze_until must be a valid ISO datetime'),
  }),
});

const getLoopSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid loop ID'),
  }),
});

const deleteLoopSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid loop ID'),
  }),
});

// ---- Helper: ownership check ----

async function getOwnedLoop(id: string, userId: string) {
  const { data, error } = await supabase
    .from('loops')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return null;
  }
  return data;
}

// ---- Routes ----

/** Create a user-authored loop without requiring a source message. */
router.post(
  '/',
  requireAuth,
  validateRequest(createLoopSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'User not authenticated' });
      const { data, error } = await supabase
        .from('loops')
        .insert({
          user_id: userId,
          content: req.body.content,
          deadline: req.body.deadline || null,
          priority: req.body.priority,
          chat_id: req.body.chat_id || null,
          type: 'task',
          from_me: true,
          status: 'open',
          confidence: 1,
        })
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json({ success: true, data });
    } catch (error) {
      logger.error('Error creating loop:', error);
      return res.status(500).json({ success: false, error: 'Failed to create loop' });
    }
  }
);

/**
 * GET /loops
 * List loops for the authenticated user, with optional filters.
 */
router.get(
  '/',
  requireAuth,
  validateRequest(listLoopsSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const { status, platform, contact_id, limit, offset } = req.query as any;

      let query = supabase
        .from('loops')
        .select(`
          *,
          contact:contacts!loops_contact_id_fkey(name, inferred_name, avatar_url),
          chat:chats!loops_chat_id_fkey(
            name, is_group, platform,
            contact:contacts!chats_contact_id_fkey(name, inferred_name, avatar_url)
          )
        `, { count: 'exact' })
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (status) query = query.eq('status', status);
      if (platform) query = query.eq('platform', platform);
      if (contact_id) query = query.eq('contact_id', contact_id);

      const { data, error, count } = await query.range(offset, offset + limit - 1);

      if (error) {
        logger.error('Error listing loops:', error);
        return res.status(500).json({ success: false, error: 'Failed to fetch loops' });
      }

      const hydrated = await hydrateLoopConversations(userId, (data || []) as LoopConversationRow[]);
      return res.json({ success: true, data: hydrated, total: count ?? 0 });
    } catch (error) {
      logger.error('Error in GET /loops:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * GET /loops/:id
 * Get a single loop by ID (must belong to the authenticated user).
 */
router.get(
  '/:id',
  requireAuth,
  validateRequest(getLoopSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const { id } = req.params;
      const loop = await getOwnedLoop(id, userId);

      if (!loop) {
        return res.status(404).json({ success: false, error: 'Loop not found' });
      }

      return res.json({ success: true, data: loop });
    } catch (error) {
      logger.error('Error in GET /loops/:id:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * PATCH /loops/:id
 * Update status, notes, deadline, or priority of a loop.
 */
router.patch(
  '/:id',
  requireAuth,
  validateRequest(updateLoopSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const { id } = req.params;

      // Verify ownership first
      const existing = await getOwnedLoop(id, userId);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Loop not found' });
      }

      const updates: Record<string, any> = { ...req.body };

      // If marking complete, record the timestamp
      if (updates.status === 'done' && !existing.completed_at) {
        updates.completed_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from('loops')
        .update(updates)
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        logger.error('Error updating loop:', error);
        return res.status(500).json({ success: false, error: 'Failed to update loop' });
      }

      return res.json({ success: true, data });
    } catch (error) {
      logger.error('Error in PATCH /loops/:id:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * POST /loops/:id/snooze
 * Snooze a loop by updating its deadline.
 */
router.post(
  '/:id/snooze',
  requireAuth,
  validateRequest(snoozeLoopSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const { id } = req.params;
      const { snooze_until } = req.body;

      const existing = await getOwnedLoop(id, userId);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Loop not found' });
      }

      // Snooze must not touch `deadline`. Overwriting it — as this endpoint used
      // to — destroys the date the user actually committed to, so a loop
      // snoozed twice loses the commitment it was tracking.
      const { data, error } = await supabase
        .from('loops')
        .update({ snoozed_until: snooze_until, status: 'snoozed' })
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        logger.error('Error snoozing loop:', error);
        return res.status(500).json({ success: false, error: 'Failed to snooze loop' });
      }

      return res.json({ success: true, data });
    } catch (error) {
      logger.error('Error in POST /loops/:id/snooze:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * DELETE /loops/:id
 * Soft-delete (cancel) a loop.
 */
router.delete(
  '/:id',
  requireAuth,
  validateRequest(deleteLoopSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const { id } = req.params;

      const existing = await getOwnedLoop(id, userId);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Loop not found' });
      }

      const { error } = await supabase
        .from('loops')
        .update({ status: 'dropped', resolution: 'user_dismissed', resolved_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', userId);

      if (error) {
        logger.error('Error deleting loop:', error);
        return res.status(500).json({ success: false, error: 'Failed to delete loop' });
      }

      return res.status(204).send();
    } catch (error) {
      logger.error('Error in DELETE /loops/:id:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

export default router;
