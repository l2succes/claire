import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { supabase } from '../services/supabase';
import { logger } from '../utils/logger';
import { platformManager, Platform } from '../adapters';
import { MatrixBridgeAdapter } from '../adapters/matrix';

const router = Router();
const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const createSchema = z.object({ name: z.string().trim().min(1).max(48), color: color.optional() });
const updateSchema = z.object({ name: z.string().trim().min(1).max(48).optional(), color: color.optional(), sortOrder: z.number().int().min(0).optional() });

router.use(requireAuth);

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    await supabase.rpc('ensure_personal_profile', { target_user_id: userId });
    const [{ data: profiles, error }, { data: unread }] = await Promise.all([
      supabase.from('profiles').select('id,name,color,is_personal,sort_order,created_at').eq('user_id', userId).order('sort_order').order('created_at'),
      supabase.from('chats').select('profile_id,unread_count').eq('user_id', userId).gt('unread_count', 0),
    ]);
    if (error) throw error;
    const unreadByProfile = new Map<string, number>();
    for (const row of unread || []) {
      const profileId = typeof row.profile_id === 'string' ? row.profile_id : '';
      unreadByProfile.set(profileId, (unreadByProfile.get(profileId) || 0) + (Number(row.unread_count) || 0));
    }
    return res.json({ success: true, data: (profiles || []).map((profile) => ({ ...profile, unreadCount: unreadByProfile.get(profile.id) || 0 })) });
  } catch (error) {
    logger.error('Unable to list profiles', error);
    return res.status(500).json({ error: 'Failed to load profiles' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'A name and six-digit color are required' });
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const { data: last } = await supabase.from('profiles').select('sort_order').eq('user_id', userId).order('sort_order', { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await supabase.from('profiles')
    .insert({ user_id: userId, name: parsed.data.name, color: parsed.data.color || '#38A169', sort_order: (last?.sort_order || 0) + 1 })
    .select('id,name,color,is_personal,sort_order,created_at').single();
  if (error) return res.status(error.code === '23505' ? 409 : 500).json({ error: error.code === '23505' ? 'A profile with that name already exists' : 'Failed to create profile' });
  return res.status(201).json({ success: true, data: { ...data, unreadCount: 0 } });
});

router.patch('/:profileId', async (req: Request, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid profile update' });
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const updates: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.color !== undefined) updates.color = parsed.data.color;
  if (parsed.data.sortOrder !== undefined) updates.sort_order = parsed.data.sortOrder;
  const { data, error } = await supabase.from('profiles').update(updates).eq('id', req.params.profileId).eq('user_id', userId).select('id,name,color,is_personal,sort_order,created_at').maybeSingle();
  if (error) return res.status(500).json({ error: 'Failed to update profile' });
  if (!data) return res.status(404).json({ error: 'Profile not found' });
  return res.json({ success: true, data });
});

router.delete('/:profileId', async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const { data: profile } = await supabase.from('profiles').select('id,is_personal').eq('id', req.params.profileId).eq('user_id', userId).maybeSingle();
  if (!profile) return res.status(404).json({ error: 'Profile not found' });
  if (profile.is_personal) return res.status(400).json({ error: 'Personal cannot be deleted' });
  const [{ count: sessions }, { count: chats }] = await Promise.all([
    supabase.from('platform_sessions').select('id', { count: 'exact', head: true }).eq('profile_id', profile.id),
    supabase.from('chats').select('id', { count: 'exact', head: true }).eq('profile_id', profile.id),
  ]);
  if ((sessions || 0) + (chats || 0) > 0) return res.status(409).json({ error: 'Move or disconnect this profile’s accounts before deleting it' });
  const { error } = await supabase.from('profiles').delete().eq('id', profile.id).eq('user_id', userId);
  if (error) return res.status(500).json({ error: 'Failed to delete profile' });
  return res.json({ success: true });
});

router.post('/:profileId/move-session', async (req: Request, res: Response) => {
  const userId = req.user?.id;
  const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : '';
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });
  const { data: connection } = await supabase.from('platform_sessions').select('platform').eq('session_id', sessionId).eq('user_id', userId).maybeSingle();
  const { error } = await supabase.rpc('move_platform_session_to_profile', {
    target_user_id: userId, target_session_id: sessionId, target_profile_id: req.params.profileId,
  });
  if (error) return res.status(error.message.includes('not found') ? 404 : 500).json({ error: error.message });
  const adapter = connection?.platform ? platformManager.getAdapter(connection.platform as Platform) : undefined;
  if (adapter instanceof MatrixBridgeAdapter) await adapter.assignSessionProfile(sessionId, req.params.profileId);
  return res.json({ success: true });
});

export default router;
