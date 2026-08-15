import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { supabase } from '../services/supabase';
import { logger } from '../utils/logger';

const router = Router();
const schema = z.object({ query: z.object({
  q: z.string().trim().min(1).max(300),
  scope: z.enum(['everything', 'messages', 'people', 'files', 'promises']).optional().default('everything'),
  limit: z.string().optional().transform(value => value ? Math.max(1, Math.min(50, Number.parseInt(value, 10))) : 20),
}) });

router.get('/', requireAuth, validateRequest(schema), async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'User not authenticated' });
    const { q, scope, limit } = req.query as unknown as { q: string; scope: string; limit: number };
    const pattern = `%${q.replace(/[%,]/g, ' ')}%`;
    const wants = (kind: string) => scope === 'everything' || scope === kind;

    const [messageResponse, peopleResponse, promiseResponse, fileResponse] = await Promise.all([
      wants('messages') ? supabase.from('messages').select('id, chat_id, content, timestamp, platform, contact_name, from_me, chat:chats!messages_chat_id_fkey(name, is_group), contact:contacts!messages_contact_id_fkey(name, inferred_name, avatar_url)').eq('user_id', userId).eq('is_deleted', false).ilike('content', pattern).order('timestamp', { ascending: false }).limit(limit) : Promise.resolve({ data: [], error: null }),
      wants('people') ? supabase.from('contacts').select('id, name, inferred_name, phone_number, avatar_url, platform, is_group').eq('user_id', userId).or(`name.ilike.${pattern},inferred_name.ilike.${pattern},phone_number.ilike.${pattern}`).limit(limit) : Promise.resolve({ data: [], error: null }),
      wants('promises') ? supabase.from('promises').select('id, content, deadline, status, chat_id, chat:chats!promises_chat_id_fkey(name, is_group, platform)').eq('user_id', userId).ilike('content', pattern).order('created_at', { ascending: false }).limit(limit) : Promise.resolve({ data: [], error: null }),
      wants('files') ? supabase.from('messages').select('id, chat_id, content, content_type, media_mime_type, media_url, timestamp, platform, contact_name, chat:chats!messages_chat_id_fkey(name, is_group)').eq('user_id', userId).eq('is_deleted', false).neq('content_type', 'text').or(`content.ilike.${pattern},media_mime_type.ilike.${pattern}`).order('timestamp', { ascending: false }).limit(limit) : Promise.resolve({ data: [], error: null }),
    ]);
    const error = messageResponse.error || peopleResponse.error || promiseResponse.error || fileResponse.error;
    if (error) throw error;
    return res.json({ success: true, data: {
      query: q,
      scope,
      messages: messageResponse.data || [],
      people: peopleResponse.data || [],
      promises: promiseResponse.data || [],
      files: fileResponse.data || [],
      counts: { messages: messageResponse.data?.length || 0, people: peopleResponse.data?.length || 0, promises: promiseResponse.data?.length || 0, files: fileResponse.data?.length || 0 },
    } });
  } catch (error) {
    logger.error('Unified search failed:', error);
    return res.status(500).json({ success: false, error: 'Search failed' });
  }
});

export default router;
