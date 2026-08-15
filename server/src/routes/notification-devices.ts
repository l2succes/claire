import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { supabase } from '../services/supabase';
import { notificationPresence } from '../services/notification-presence';
import { logger } from '../utils/logger';

const router = Router();

const deviceSchema = z.object({
  body: z.object({
    deviceId: z.string().min(8).max(200),
    platform: z.enum(['ios', 'android', 'macos', 'windows', 'web']),
    provider: z.enum(['expo', 'apns', 'fcm', 'webpush']),
    token: z.string().min(1),
    timezone: z.string().min(1).max(100).default('UTC'),
    appVersion: z.string().max(100).optional(),
    enabled: z.boolean().optional(),
  }),
});

const presenceSchema = z.object({
  body: z.object({
    deviceId: z.string().min(8).max(200),
    state: z.enum(['foreground', 'background']),
    chatId: z.string().uuid().nullable().optional(),
  }),
});

router.put('/', requireAuth, validateRequest(deviceSchema), async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'User not authenticated' });
  const { deviceId, platform, provider, token, timezone, appVersion, enabled } = req.body;
  const now = new Date().toISOString();
  const { data, error } = await supabase.from('notification_devices').upsert({
    user_id: userId,
    device_id: deviceId,
    platform,
    provider,
    token,
    timezone,
    app_version: appVersion ?? null,
    enabled: enabled ?? true,
    last_seen_at: now,
    token_refreshed_at: now,
    updated_at: now,
  }, { onConflict: 'user_id,device_id' }).select('id,device_id,platform,provider,enabled').single();
  if (error) {
    logger.error('Unable to register notification device', error);
    return res.status(500).json({ error: 'Failed to register notification device' });
  }
  return res.json({ success: true, data });
});

router.post('/presence', requireAuth, validateRequest(presenceSchema), async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'User not authenticated' });
  const { deviceId, state, chatId } = req.body;
  const { data: device } = await supabase.from('notification_devices').select('id').eq('user_id', userId).eq('device_id', deviceId).maybeSingle();
  if (!device) return res.status(404).json({ error: 'Notification device not registered' });
  await notificationPresence.update(userId, deviceId, state, chatId ?? undefined);
  await supabase.from('notification_devices').update({ last_seen_at: new Date().toISOString() }).eq('id', device.id);
  return res.json({ success: true });
});

router.delete('/:deviceId', requireAuth, async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'User not authenticated' });
  const deviceId = req.params.deviceId;
  const { error } = await supabase.from('notification_devices').delete().eq('user_id', userId).eq('device_id', deviceId);
  if (error) return res.status(500).json({ error: 'Failed to deregister notification device' });
  await notificationPresence.clear(userId, deviceId);
  return res.json({ success: true });
});

export default router;
