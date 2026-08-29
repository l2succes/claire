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
    // People is an address book as well as a conversation workspace. The
    // mobile client asks for the bounded full directory so its A–Z index can
    // jump reliably; keep the server-side cap aligned with the bridge sync.
    const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit ?? ''), 10) || 80, 1), 10_000);
    const offset = Math.max(Number.parseInt(String(req.query.offset ?? ''), 10) || 0, 0);
    const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const platform = typeof req.query.platform === 'string' ? req.query.platform : 'all';
    const filter = typeof req.query.filter === 'string' ? req.query.filter : 'all';

    const contactsQuery = () => {
      let query = supabase
        .from('contacts')
        .select('id, name, phone_number, platform_contact_id, avatar_url, inferred_name, inferred_relationship, is_group, platform, username')
        .eq('user_id', userId)
        .order('name', { ascending: true, nullsFirst: false })
        .order('id', { ascending: true });

      if (platform !== 'all') query = query.eq('platform', platform);
      // "Contacted" is maintained by a database trigger, rather than passing
      // a potentially huge message-derived ID list through a URL query.
      if (filter === 'contacted') query = query.eq('is_group', false).gt('outbound_message_count', 0);
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
      return query;
    };

    // Supabase deployments often cap one PostgREST response at 1,000 rows.
    // Fetch in internal chunks so a 10k directory still reaches the mobile
    // A–Z list as one complete, correctly sorted data set.
    const rows: DbRow[] = [];
    const desiredRows = limit + 1;
    for (let pageOffset = offset; rows.length < desiredRows; ) {
      const chunkSize = Math.min(1_000, desiredRows - rows.length);
      const { data, error } = await contactsQuery().range(pageOffset, pageOffset + chunkSize - 1);
      if (error) throw error;
      const chunk = (data || []) as DbRow[];
      rows.push(...chunk);
      if (chunk.length < chunkSize) break;
      pageOffset += chunk.length;
    }
    const page = rows.slice(0, limit);
    const contactIds = page.map((contact: DbRow) => contact.id as string);
    const chatsByContact = new Map<string, DbRow>();
    // PostgREST takes its filters in the URL, so `.in()` spends roughly 40
    // bytes of querystring per UUID. At this endpoint's 10k ceiling that is a
    // ~400KB request line, which the gateway rejects long before Postgres sees
    // it — the People screen then sat on its skeleton forever, because the
    // client's fetch has no timeout to turn the failure into an error state.
    // Chunked, each request stays well inside every proxy's limit.
    const CHAT_LOOKUP_CHUNK = 200;
    for (let index = 0; index < contactIds.length; index += CHAT_LOOKUP_CHUNK) {
      const chunk = contactIds.slice(index, index + CHAT_LOOKUP_CHUNK);
      let chatQuery = supabase
        .from('chats')
        .select('id, contact_id, name, platform, is_group, last_message_at')
        .eq('user_id', userId)
        .in('contact_id', chunk)
        .order('last_message_at', { ascending: false, nullsFirst: false });
      if (platform !== 'all') chatQuery = chatQuery.eq('platform', platform);
      const { data: linkedChats, error: linkedChatsError } = await chatQuery;
      if (linkedChatsError) throw linkedChatsError;
      for (const chat of linkedChats || []) {
        if (chat.contact_id && !chatsByContact.has(chat.contact_id)) {
          chatsByContact.set(chat.contact_id, chat);
        }
      }
    }
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
 * People query polls while the deduplicated server task enriches and imports
 * the linked account's contact directory, and the task reads no message
 * bodies.
 */
router.post('/identity-backfill', requireAuth, async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

  try {
    void queueWhatsAppContactIdentitySync(userId, Number(req.body?.limit))
      .then((result) => logger.info('WhatsApp contact identity sync completed', {
        scanned: result.scanned,
        matched: result.matched,
        created: result.created,
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
