import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { supabase } from '../services/supabase';
import { logger } from '../utils/logger';
import { voiceProfileService } from '../services/voice-profile-service';
import { aiProcessingDisclosure, isAiProcessingEnabled } from '../services/ai-policy';

const router = Router();

const VALID_TONES = ['friendly', 'professional', 'casual', 'formal', 'empathetic'] as const;
const VALID_STYLES = ['concise', 'detailed', 'balanced'] as const;
const desktopShortcutSchema = z.record(z.string(), z.string().min(1).max(32)).refine(
  (shortcuts) => new Set(Object.values(shortcuts)).size === Object.values(shortcuts).length,
  'Desktop shortcuts must not conflict',
);

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
        ai_enabled: z.boolean().optional(),
        desktop_appearance: z.object({
          theme: z.enum(['system', 'light', 'dark']).optional(),
          density: z.enum(['comfortable', 'compact']).optional(),
          scale: z.number().min(0.9).max(1.15).optional(),
        }).optional(),
        desktop_shortcuts: desktopShortcutSchema.optional(),
        desktop_inbox_inspector: z.enum(['contact', 'assistant']).optional(),
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
    if (preferences !== undefined) {
      const { data: current } = await supabase
        .from('user_preferences')
        .select('preferences')
        .eq('user_id', userId)
        .maybeSingle();
      // Preference updates are partial from different clients. Preserve keys the
      // current desktop/client does not know about rather than clobbering them.
      updates.preferences = { ...(current?.preferences || {}), ...preferences };
    }

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

router.get('/privacy', requireAuth, async (req: Request, res: Response) => {
  if (!req.user?.id) return res.status(401).json({ error: 'User not authenticated' });
  return res.json({ success: true, data: { ...aiProcessingDisclosure(), enabled: await isAiProcessingEnabled(req.user.id) } });
});

router.get('/account', requireAuth, async (req: Request, res: Response) => {
  if (!req.user?.id) return res.status(401).json({ error: 'User not authenticated' });
  const { data, error } = await supabase.from('users')
    .select('email,name,avatar_url')
    .eq('id', req.user.id)
    .maybeSingle();
  if (error) return res.status(500).json({ error: 'Failed to load account profile' });
  return res.json({ success: true, data: data || { email: req.user.email || '', name: null, avatar_url: null } });
});

router.put('/account', requireAuth, async (req: Request, res: Response) => {
  if (!req.user?.id) return res.status(401).json({ error: 'User not authenticated' });
  const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 120) : undefined;
  const avatarUrl = typeof req.body?.avatar_url === 'string' ? req.body.avatar_url.trim().slice(0, 2048) : undefined;
  if (name === undefined && avatarUrl === undefined) return res.status(400).json({ error: 'Provide a name or avatar URL' });
  const { data, error } = await supabase.from('users')
    .upsert({ id: req.user.id, email: req.user.email || '', ...(name !== undefined ? { name } : {}), ...(avatarUrl !== undefined ? { avatar_url: avatarUrl } : {}), updated_at: new Date().toISOString() }, { onConflict: 'id' })
    .select('email,name,avatar_url').single();
  if (error) return res.status(500).json({ error: 'Failed to update account profile' });
  return res.json({ success: true, data });
});

router.get('/voice-profiles', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) return res.status(401).json({ error: 'User not authenticated' });
    return res.json({ success: true, data: await voiceProfileService.list(req.user.id) });
  } catch (error) {
    logger.error('Error listing voice profiles:', error);
    return res.status(500).json({ error: 'Failed to load voice profiles' });
  }
});

router.put('/voice-profiles/:language', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) return res.status(401).json({ error: 'User not authenticated' });
    const profile = typeof req.body?.profile === 'string' ? req.body.profile : '';
    if (profile.length > 1500) return res.status(400).json({ error: 'Voice profile must be 1,500 characters or less' });
    return res.json({ success: true, data: await voiceProfileService.update(req.user.id, req.params.language, profile) });
  } catch (error) {
    logger.error('Error updating voice profile:', error);
    return res.status(500).json({ error: 'Failed to update voice profile' });
  }
});

// Reset removes only the saved aggregate summary. It never deletes message history,
// so a later rebuild can safely derive a fresh profile from the user's sent messages.
router.delete('/voice-profiles/:language', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) return res.status(401).json({ error: 'User not authenticated' });
    const { error } = await supabase.from('user_voice_profiles')
      .delete().eq('user_id', req.user.id).eq('language', req.params.language);
    if (error) throw error;
    return res.json({ success: true });
  } catch (error) {
    logger.error('Error resetting voice profile:', error);
    return res.status(500).json({ error: 'Failed to reset voice profile' });
  }
});

router.post('/voice-profiles/rebuild', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) return res.status(401).json({ error: 'User not authenticated' });
    if (!await isAiProcessingEnabled(req.user.id)) return res.status(403).json({ error: 'AI processing is disabled for this account' });
    if (!voiceProfileService.isConfigured) return res.status(503).json({ error: 'AI is not configured' });
    return res.status(202).json({ success: true, data: await voiceProfileService.rebuild(req.user.id) });
  } catch (error) {
    logger.error('Error rebuilding voice profiles:', error);
    return res.status(500).json({ error: 'Failed to rebuild voice profiles' });
  }
});

export default router;
