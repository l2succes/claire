import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { supabase } from '../services/supabase';
import { logger } from '../utils/logger';

const router = Router();

const registerTokenSchema = z.object({
  body: z.object({
    token: z.string().min(1),
    platform: z.string().optional(),
    device_id: z.string().optional(),
  }),
});

/**
 * POST /push-tokens — register an Expo push token for the current user
 */
router.post(
  '/',
  requireAuth,
  validateRequest(registerTokenSchema),
  async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'User not authenticated' });

    const { token, platform = 'expo', device_id } = req.body;

    const { error } = await supabase
      .from('push_tokens')
      .upsert(
        {
          user_id: userId,
          token,
          platform,
          device_id: device_id ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,token' }
      );

    if (error) {
      logger.error('Error registering push token:', error);
      return res.status(500).json({ error: 'Failed to register push token' });
    }

    return res.json({ success: true });
  }
);

export default router;
