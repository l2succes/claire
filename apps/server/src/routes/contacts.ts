import { Router, Request, Response } from 'express';
import { supabase, type DbRow } from '../services/supabase';
import { requireAuth } from '../middleware/auth';
import { logger } from '../utils/logger';
import { queueWhatsAppContactIdentitySync } from '../services/whatsapp-contact-backfill';
import { phoneNumberFromPlatformContactId } from '../services/contact-identity';
import { Platform } from '../adapters/types';

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

    // People is a conversation workspace, not a raw bridge directory. Older
    // mautrix syncs could leave thousands of historical/LID-only directory
    // records behind with no Claire chat. Showing those records made the list
    // both slow and impossible to identify. Start from actual conversations,
    // then load only their linked contacts.
    let chatQuery = supabase
      .from('chats')
      .select('id, contact_id, name, platform, is_group, last_message_at')
      .eq('user_id', userId)
      .not('contact_id', 'is', null)
      .order('last_message_at', { ascending: false, nullsFirst: false });
    if (platform !== 'all') chatQuery = chatQuery.eq('platform', platform);
    const { data: linkedChats, error: linkedChatsError } = await chatQuery;
    if (linkedChatsError) throw linkedChatsError;

    const chatsByContact = new Map<string, DbRow>();
    for (const chat of linkedChats || []) {
      if (chat.contact_id && !chatsByContact.has(chat.contact_id)) {
        chatsByContact.set(chat.contact_id, chat);
      }
    }
    const linkedContactIds = [...chatsByContact.keys()];
    if (!linkedContactIds.length) {
      return res.json({ success: true, data: { contacts: [], nextOffset: null } });
    }

    let query = supabase
      .from('contacts')
      .select('id, name, phone_number, platform_contact_id, avatar_url, inferred_name, inferred_relationship, is_group, platform, username')
      .eq('user_id', userId)
      .in('id', linkedContactIds)
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
    return res.json({
      success: true,
      data: {
        contacts: page.map((contact: DbRow) => {
          const platform = contact.platform as Platform;
          // Some older WhatsApp imports predate phone_number but do retain a
          // real phone JID as their platform contact ID. Expose that as a
          // canonical display fallback; LIDs remain deliberately hidden.
          const phoneNumber = contact.phone_number || phoneNumberFromPlatformContactId(platform, contact.platform_contact_id as string | null | undefined);
          return { ...contact, phone_number: phoneNumber, chat: chatsByContact.get(contact.id as string) || null };
        }),
        nextOffset: rows.length > limit ? offset + limit : null,
      },
    });
  } catch (error) {
    logger.error('Error fetching contacts:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch contacts' });
  }
});

/**
 * Start a user-scoped WhatsApp contact identity sync. This is asynchronous on
 * purpose: a large address book must never keep a mobile request open. The
 * People query polls while the deduplicated server task enriches existing
 * contacts, and the task reads no message bodies.
 */
router.post('/identity-backfill', requireAuth, async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

  try {
    void queueWhatsAppContactIdentitySync(userId, Number(req.body?.limit))
      .then((result) => logger.info('WhatsApp contact identity sync completed', {
        scanned: result.scanned,
        matched: result.matched,
        updated: result.updated,
        unresolved: result.unresolved,
        hasMore: result.hasMore,
      }))
      .catch((error) => logger.warn('WhatsApp contact identity sync did not complete', {
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
    return res.status(202).json({ success: true, data: { status: 'started' } });
  } catch (error) {
    logger.error('WhatsApp contact identity backfill failed', { error, userId });
    return res.status(500).json({ success: false, error: 'Could not refresh WhatsApp identities' });
  }
});

export default router;
