import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { supabase } from '../services/supabase';
import { validateRequest } from '../middleware/validation';
import { requireAuth } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();

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
        .select('*', { count: 'exact' })
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

      return res.json({ success: true, data, total: count ?? 0 });
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
