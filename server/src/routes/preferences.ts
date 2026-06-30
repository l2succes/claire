import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { supabase } from '../services/supabase';
import { logger } from '../utils/logger';

const router = Router();

const VALID_TONES = ['friendly', 'professional', 'casual', 'formal', 'empathetic'] as const;
const VALID_STYLES = ['concise', 'detailed', 'balanced'] as const;

const updatePreferencesSchema = z.object({
  body: z.object({
    tone: z.enum(VALID_TONES).optional(),
    response_style: z.enum(VALID_STYLES).optional(),
    language: z.string().min(2).max(10).optional(),
    notification_enabled: z.boolean().optional(),
    preferences: z
      .object({
        personality: z.array(z.string()).optional(),
        quiet_hours_enabled: z.boolean().optional(),
        quiet_hours_start: z.string().regex(/^\d{2}:\d{2}$/).optional(),
        quiet_hours_end: z.string().regex(/^\d{2}:\d{2}$/).optional(),
        notify_messages: z.boolean().optional(),
        notify_promises: z.boolean().optional(),
        notify_ai_suggestions: z.boolean().optional(),
      })
      .optional(),
  }),
});

/**
 * GET /preferences — return the current user's AI preferences
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'User not authenticated' });

  const { data, error } = await supabase
    .from('user_preferences')
    .select('tone, response_style, language, notification_enabled, preferences')
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') {
    logger.error('Error fetching preferences:', error);
    return res.status(500).json({ error: 'Failed to fetch preferences' });
  }

  // Return defaults if no row yet
  return res.json({
    success: true,
    data: data ?? {
      tone: 'friendly',
      response_style: 'concise',
      language: 'en',
      notification_enabled: true,
      preferences: {},
    },
  });
});

/**
 * PUT /preferences — upsert AI preferences for the current user
 */
router.put(
  '/',
  requireAuth,
  validateRequest(updatePreferencesSchema),
  async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'User not authenticated' });

    const { tone, response_style, language, notification_enabled, preferences } = req.body;

    const updates: Record<string, unknown> = { user_id: userId };
    if (tone !== undefined) updates.tone = tone;
    if (response_style !== undefined) updates.response_style = response_style;
    if (language !== undefined) updates.language = language;
    if (notification_enabled !== undefined) updates.notification_enabled = notification_enabled;
    if (preferences !== undefined) updates.preferences = preferences;

    const { data, error } = await supabase
      .from('user_preferences')
      .upsert(updates, { onConflict: 'user_id' })
      .select('tone, response_style, language, notification_enabled, preferences')
      .single();

    if (error) {
      logger.error('Error updating preferences:', error);
      return res.status(500).json({ error: 'Failed to update preferences' });
    }

    return res.json({ success: true, data });
  }
);

export default router;
