import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { pushNotificationService } from '../services/push-notification';
import { logger } from '../utils/logger';

const router = Router();

const registerTokenSchema = z.object({
  body: z.object({
    token: z.string().min(1),
    platform: z.string().optional(),
  }),
});

const deregisterTokenSchema = z.object({
  body: z.object({
    token: z.string().min(1),
  }),
});

/**
 * POST /notifications/push/register
 * Register an Expo push token for the authenticated user.
 */
router.post(
  '/push/register',
  requireAuth,
  validateRequest(registerTokenSchema),
  async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'User not authenticated' });

    const { token, platform } = req.body;

    try {
      await pushNotificationService.registerToken(userId, token, platform);
      return res.status(200).json({ success: true });
    } catch (err) {
      logger.error('Push token registration error:', err);
      return res.status(400).json({ error: (err as Error).message });
    }
  },
);

/**
 * POST /notifications/push/deregister
 * Remove an Expo push token for the authenticated user.
 */
router.post(
  '/push/deregister',
  requireAuth,
  validateRequest(deregisterTokenSchema),
  async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'User not authenticated' });

    const { token } = req.body;

    try {
      await pushNotificationService.deregisterToken(userId, token);
      return res.status(200).json({ success: true });
    } catch (err) {
      logger.error('Push token deregistration error:', err);
      return res.status(500).json({ error: 'Failed to deregister push token' });
    }
  },
);

export default router;
