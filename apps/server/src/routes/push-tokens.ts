import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { supabase } from '../services/supabase';
import { logger } from '../utils/logger';
import { createHash } from 'node:crypto';

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

    // Compatibility bridge for clients that have not moved to the
    // device-aware endpoint yet. A token hash provides a stable device key
    // without storing the token itself twice in identifiers or logs.
    const legacyDeviceId = device_id ?? `legacy-${createHash('sha256').update(token).digest('hex').slice(0, 32)}`;
    const normalizedPlatform = platform === 'android' ? 'android' : 'ios';
    const { error: deviceError } = await supabase.from('notification_devices').upsert({
      user_id: userId,
      device_id: legacyDeviceId,
      platform: normalizedPlatform,
      provider: 'expo',
      token,
      timezone: 'UTC',
      enabled: true,
      last_seen_at: new Date().toISOString(),
      token_refreshed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,device_id' });
    if (deviceError) logger.warn('Legacy push token could not be mirrored to notification devices', deviceError);

    return res.json({ success: true });
  }
);

export default router;
