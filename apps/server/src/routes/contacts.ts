import { Router, Request, Response } from 'express';
import { supabase, type DbRow } from '../services/supabase';
import { requireAuth } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();

router.get('/', requireAuth, async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

  try {
    const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit ?? ''), 10) || 80, 1), 100);
    const offset = Math.max(Number.parseInt(String(req.query.offset ?? ''), 10) || 0, 0);
    const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const platform = typeof req.query.platform === 'string' ? req.query.platform : 'all';
    const filter = typeof req.query.filter === 'string' ? req.query.filter : 'all';

    let query = supabase
      .from('contacts')
      .select('id, name, phone_number, avatar_url, inferred_name, inferred_relationship, is_group, platform, username')
      .eq('user_id', userId)
      .order('name', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true })
      .range(offset, offset + limit);

    if (platform !== 'all') query = query.eq('platform', platform);
    if (filter === 'needs_context') query = query.eq('is_group', false).is('inferred_relationship', null);
    if (filter === 'groups') query = query.eq('is_group', true);
    if (search) {
      // PostgREST's OR grammar treats commas and parentheses as syntax. They
      // aren't useful for People search, so make them literal-free first.
      const pattern = `%${search.replace(/[%,()]/g, ' ')}%`;
      query = query.or(
        `name.ilike.${pattern},` +
        `inferred_name.ilike.${pattern},` +
        `phone_number.ilike.${pattern},` +
        `username.ilike.${pattern}`,
      );
    }

    // Fetch one extra row rather than an exact count. Exact counts become an
    // unnecessary full-table scan when a user has a large imported address
    // book, and the UI only needs to know whether another page exists.
    const { data, error } = await query;

    if (error) throw error;

    const rows = data || [];
    const page = rows.slice(0, limit);
    const contactIds = page.map((contact: DbRow) => contact.id as string);
    const chatsByContact = new Map<string, DbRow>();
    if (contactIds.length) {
      const { data: chats, error: chatsError } = await supabase
        .from('chats')
        .select('id, contact_id, name, platform, is_group, last_message_at')
        .eq('user_id', userId)
        .in('contact_id', contactIds)
        .order('last_message_at', { ascending: false, nullsFirst: false });
      if (chatsError) throw chatsError;
      for (const chat of chats || []) {
        if (chat.contact_id && !chatsByContact.has(chat.contact_id)) chatsByContact.set(chat.contact_id, chat);
      }
    }

    return res.json({
      success: true,
      data: {
        contacts: page.map((contact: DbRow) => ({ ...contact, chat: chatsByContact.get(contact.id as string) || null })),
        nextOffset: rows.length > limit ? offset + limit : null,
      },
    });
  } catch (error) {
    logger.error('Error fetching contacts:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch contacts' });
  }
});

export default router;
