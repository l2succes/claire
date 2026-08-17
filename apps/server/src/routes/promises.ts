import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { supabase, type DbRow } from '../services/supabase';
import { validateRequest } from '../middleware/validation';
import { requireAuth } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();

type PromiseConversationRow = {
  id: string;
  message_id?: string | null;
  chat_id?: string | null;
  contact_name?: string | null;
  platform?: string | null;
  contact?: unknown;
  chat?: unknown;
  [key: string]: unknown;
};

async function hydratePromiseConversations(userId: string, rows: PromiseConversationRow[]) {
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

const listPromisesSchema = z.object({
  query: z.object({
    status: z.enum(['pending', 'completed', 'cancelled', 'overdue']).optional(),
    platform: z.string().optional(),
    contact_id: z.string().uuid().optional(),
    limit: z.string().optional().transform(val => val ? Math.min(parseInt(val, 10), 200) : 50),
    offset: z.string().optional().transform(val => val ? parseInt(val, 10) : 0),
  }),
});

const updatePromiseSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid promise ID'),
  }),
  body: z.object({
    status: z.enum(['pending', 'completed', 'cancelled', 'overdue']).optional(),
    notes: z.string().optional(),
    deadline: z.string().datetime().optional(),
    priority: z.enum(['low', 'medium', 'high']).optional(),
  }).refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  }),
});

const createPromiseSchema = z.object({
  body: z.object({
    content: z.string().trim().min(1).max(1_000),
    deadline: z.string().datetime().nullable().optional(),
    priority: z.enum(['low', 'medium', 'high']).optional().default('medium'),
    chat_id: z.string().uuid().nullable().optional(),
  }),
});

const snoozePromiseSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid promise ID'),
  }),
  body: z.object({
    snooze_until: z.string().datetime('snooze_until must be a valid ISO datetime'),
  }),
});

const getPromiseSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid promise ID'),
  }),
});

const deletePromiseSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid promise ID'),
  }),
});

// ---- Helper: ownership check ----

async function getOwnedPromise(id: string, userId: string) {
  const { data, error } = await supabase
    .from('promises')
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

/** Create a user-authored promise without requiring a source message. */
router.post(
  '/',
  requireAuth,
  validateRequest(createPromiseSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'User not authenticated' });
      const { data, error } = await supabase
        .from('promises')
        .insert({
          user_id: userId,
          content: req.body.content,
          deadline: req.body.deadline || null,
          priority: req.body.priority,
          chat_id: req.body.chat_id || null,
          type: 'task',
          from_me: true,
          status: 'pending',
          confidence: 1,
        })
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json({ success: true, data });
    } catch (error) {
      logger.error('Error creating promise:', error);
      return res.status(500).json({ success: false, error: 'Failed to create promise' });
    }
  }
);

/**
 * GET /promises
 * List promises for the authenticated user, with optional filters.
 */
router.get(
  '/',
  requireAuth,
  validateRequest(listPromisesSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const { status, platform, contact_id, limit, offset } = req.query as any;

      let query = supabase
        .from('promises')
        .select(`
          *,
          contact:contacts!promises_contact_id_fkey(name, inferred_name, avatar_url),
          chat:chats!promises_chat_id_fkey(
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
        logger.error('Error listing promises:', error);
        return res.status(500).json({ success: false, error: 'Failed to fetch promises' });
      }

      const hydrated = await hydratePromiseConversations(userId, (data || []) as PromiseConversationRow[]);
      return res.json({ success: true, data: hydrated, total: count ?? 0 });
    } catch (error) {
      logger.error('Error in GET /promises:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * GET /promises/:id
 * Get a single promise by ID (must belong to the authenticated user).
 */
router.get(
  '/:id',
  requireAuth,
  validateRequest(getPromiseSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const { id } = req.params;
      const promise = await getOwnedPromise(id, userId);

      if (!promise) {
        return res.status(404).json({ success: false, error: 'Promise not found' });
      }

      return res.json({ success: true, data: promise });
    } catch (error) {
      logger.error('Error in GET /promises/:id:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * PATCH /promises/:id
 * Update status, notes, deadline, or priority of a promise.
 */
router.patch(
  '/:id',
  requireAuth,
  validateRequest(updatePromiseSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const { id } = req.params;

      // Verify ownership first
      const existing = await getOwnedPromise(id, userId);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Promise not found' });
      }

      const updates: Record<string, any> = { ...req.body };

      // If marking complete, record the timestamp
      if (updates.status === 'completed' && !existing.completed_at) {
        updates.completed_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from('promises')
        .update(updates)
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        logger.error('Error updating promise:', error);
        return res.status(500).json({ success: false, error: 'Failed to update promise' });
      }

      return res.json({ success: true, data });
    } catch (error) {
      logger.error('Error in PATCH /promises/:id:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * POST /promises/:id/snooze
 * Snooze a promise by updating its deadline.
 */
router.post(
  '/:id/snooze',
  requireAuth,
  validateRequest(snoozePromiseSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const { id } = req.params;
      const { snooze_until } = req.body;

      const existing = await getOwnedPromise(id, userId);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Promise not found' });
      }

      const { data, error } = await supabase
        .from('promises')
        .update({ deadline: snooze_until, status: 'pending' })
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        logger.error('Error snoozing promise:', error);
        return res.status(500).json({ success: false, error: 'Failed to snooze promise' });
      }

      return res.json({ success: true, data });
    } catch (error) {
      logger.error('Error in POST /promises/:id/snooze:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * DELETE /promises/:id
 * Soft-delete (cancel) a promise.
 */
router.delete(
  '/:id',
  requireAuth,
  validateRequest(deletePromiseSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const { id } = req.params;

      const existing = await getOwnedPromise(id, userId);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Promise not found' });
      }

      const { error } = await supabase
        .from('promises')
        .update({ status: 'cancelled' })
        .eq('id', id)
        .eq('user_id', userId);

      if (error) {
        logger.error('Error deleting promise:', error);
        return res.status(500).json({ success: false, error: 'Failed to delete promise' });
      }

      return res.status(204).send();
    } catch (error) {
      logger.error('Error in DELETE /promises/:id:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

export default router;
