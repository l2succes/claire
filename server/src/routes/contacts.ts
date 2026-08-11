import { Router, Request, Response } from 'express';
import { supabase } from '../services/supabase';
import { requireAuth } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();

router.get('/', requireAuth, async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

  try {
    const { data, error } = await supabase
      .from('contacts')
      .select('id, name, phone_number, avatar_url, platform')
      .eq('user_id', userId)
      .eq('is_group', false)
      .not('avatar_url', 'is', null)
      .neq('avatar_url', '')
      .order('avatar_url', { ascending: false, nullsFirst: false })
      .order('name', { ascending: true })
      .limit(24);

    if (error) throw error;
    return res.json({ success: true, contacts: data || [] });
  } catch (error) {
    logger.error('Error fetching contacts:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch contacts' });
  }
});

export default router;
