/**
 * /auto-reply — CRUD for auto-reply rules (issue #39)
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { supabase } from '../services/supabase';
import { logger } from '../utils/logger';

const router = Router();

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const createRuleSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required'),
    trigger_type: z.enum(['keyword', 'birthday', 'thanks']),
    keywords: z.array(z.string()).optional(),
    reply_template: z.string().min(1, 'Reply template is required'),
    platforms: z.array(z.string()).optional(),
    max_per_hour: z.number().int().min(1).max(60).optional().default(5),
    max_per_day: z.number().int().min(1).max(500).optional().default(20),
  }),
});

const updateRuleSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    name: z.string().min(1).optional(),
    enabled: z.boolean().optional(),
    trigger_type: z.enum(['keyword', 'birthday', 'thanks']).optional(),
    keywords: z.array(z.string()).optional(),
    reply_template: z.string().min(1).optional(),
    platforms: z.array(z.string()).optional(),
    max_per_hour: z.number().int().min(1).max(60).optional(),
    max_per_day: z.number().int().min(1).max(500).optional(),
  }),
});

const ruleIdSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

// ---------------------------------------------------------------------------
// GET /auto-reply — list all rules for the authenticated user
// ---------------------------------------------------------------------------

router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const { data, error } = await supabase
    .from('auto_reply_rules')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    logger.error('auto-reply list error:', error);
    res.status(500).json({ error: 'Failed to fetch rules' });
    return;
  }
  res.json({ rules: data ?? [] });
});

// ---------------------------------------------------------------------------
// POST /auto-reply — create a rule
// ---------------------------------------------------------------------------

router.post(
  '/',
  requireAuth,
  validateRequest(createRuleSchema),
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id;
    const { name, trigger_type, keywords, reply_template, platforms, max_per_hour, max_per_day } =
      req.body;

    const { data, error } = await supabase
      .from('auto_reply_rules')
      .insert({
        user_id: userId,
        name,
        trigger_type,
        keywords: keywords ?? null,
        reply_template,
        platforms: platforms ?? null,
        max_per_hour: max_per_hour ?? 5,
        max_per_day: max_per_day ?? 20,
      })
      .select()
      .single();

    if (error) {
      logger.error('auto-reply create error:', error);
      res.status(500).json({ error: 'Failed to create rule' });
      return;
    }
    res.status(201).json({ rule: data });
  }
);

// ---------------------------------------------------------------------------
// PATCH /auto-reply/:id — update a rule
// ---------------------------------------------------------------------------

router.patch(
  '/:id',
  requireAuth,
  validateRequest(updateRuleSchema),
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id;
    const { id } = req.params;
    const updates = { ...req.body, updated_at: new Date().toISOString() };

    const { data, error } = await supabase
      .from('auto_reply_rules')
      .update(updates)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      logger.error('auto-reply update error:', error);
      res.status(500).json({ error: 'Failed to update rule' });
      return;
    }
    if (!data) {
      res.status(404).json({ error: 'Rule not found' });
      return;
    }
    res.json({ rule: data });
  }
);

// ---------------------------------------------------------------------------
// DELETE /auto-reply/:id — delete a rule
// ---------------------------------------------------------------------------

router.delete(
  '/:id',
  requireAuth,
  validateRequest(ruleIdSchema),
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id;
    const { id } = req.params;

    const { error } = await supabase
      .from('auto_reply_rules')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      logger.error('auto-reply delete error:', error);
      res.status(500).json({ error: 'Failed to delete rule' });
      return;
    }
    res.json({ success: true });
  }
);

export default router;
