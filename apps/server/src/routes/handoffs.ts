import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { supabase } from '../services/supabase';
import { logger } from '../utils/logger';

const router = Router();
const payloadSchema = z.object({
  route: z.string().max(300).optional(),
  chatId: z.string().uuid().optional(),
  draft: z.string().max(20_000).optional(),
  assistantThreadId: z.string().uuid().optional(),
  query: z.string().max(1_000).optional(),
}).strict();
const upsertSchema = z.object({ body: z.object({
  installationId: z.string().min(12).max(200),
  sourcePlatform: z.enum(['ios', 'android', 'web', 'electron']),
  kind: z.enum(['chat_draft', 'assistant_thread', 'search', 'workspace']),
  payload: payloadSchema,
}) });
const idSchema = z.object({ params: z.object({ id: z.string().uuid() }) });

router.get('/', requireAuth, async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'User not authenticated' });
  const { data, error } = await supabase.from('workspace_handoffs')
    .select('id, installation_id, source_platform, kind, payload, updated_at, expires_at')
    .eq('user_id', userId).gt('expires_at', new Date().toISOString()).order('updated_at', { ascending: false });
  if (error) { logger.error('Unable to list workspace handoffs', error); return res.status(500).json({ error: 'Failed to load handoffs' }); }
  return res.json({ handoffs: data || [] });
});

router.put('/self', requireAuth, validateRequest(upsertSchema), async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'User not authenticated' });
  const { installationId, sourcePlatform, kind, payload } = req.body;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase.from('workspace_handoffs').upsert({
    user_id: userId, installation_id: installationId, source_platform: sourcePlatform, kind, payload,
    updated_at: now.toISOString(), expires_at: expiresAt,
  }, { onConflict: 'user_id,installation_id,kind' }).select('id, installation_id, source_platform, kind, payload, updated_at, expires_at').single();
  if (error) { logger.error('Unable to save workspace handoff', error); return res.status(500).json({ error: 'Failed to save handoff' }); }
  return res.json({ handoff: data });
});

router.delete('/:id', requireAuth, validateRequest(idSchema), async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'User not authenticated' });
  const { error } = await supabase.from('workspace_handoffs').delete().eq('id', req.params.id).eq('user_id', userId);
  if (error) return res.status(500).json({ error: 'Failed to remove handoff' });
  return res.status(204).end();
});

export default router;
