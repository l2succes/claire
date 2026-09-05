import { Router, Request, Response } from 'express';
import { config } from '../config';
import { requireAuth } from '../middleware/auth';
import { logger } from '../utils/logger';
import { supabase, type DbRow } from '../services/supabase';
import { smartCardGenerator } from '../services/smart-card-generator';

const router = Router();

const FEED_PAGE_SIZE = 20;
const FEED_MAX_PAGE_SIZE = 50;

/**
 * Keyset cursors are `<last_activity_at>|<chat_id>`. Offset pagination drifts
 * on this feed: a new message reorders the list between pages, so rows shift
 * across the boundary and the client both repeats and skips conversations.
 */
function encodeCursor(row: DbRow): string {
  return `${row.last_activity_at as string}|${row.chat_id as string}`;
}

function decodeCursor(value: unknown): { lastActivityAt: string; chatId: string } | null {
  if (typeof value !== 'string' || !value.includes('|')) return null;
  const separator = value.lastIndexOf('|');
  const lastActivityAt = value.slice(0, separator);
  const chatId = value.slice(separator + 1);
  if (!lastActivityAt || !chatId) return null;
  return { lastActivityAt, chatId };
}

/**
 * GET /conversations
 * Paginate the unified inbox one row per conversation.
 *
 * The inbox is a list of conversations, so it must paginate over
 * conversations. Paginating `messages` and collapsing them client-side yields
 * only a few conversations per page and makes older ones effectively
 * unreachable. Backed by the `conversation_feed` view.
 *
 * Query: ?limit=20&cursor=<ts|chatId>&q=&platform=&filter=unread|groups|needs_reply
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const limit = Math.min(
      Math.max(Number.parseInt(String(req.query.limit ?? ''), 10) || FEED_PAGE_SIZE, 1),
      FEED_MAX_PAGE_SIZE,
    );
    const cursor = decodeCursor(req.query.cursor);
    const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const platform = typeof req.query.platform === 'string' ? req.query.platform : '';
    const filter = typeof req.query.filter === 'string' ? req.query.filter : '';

    let query = supabase
      .from('conversation_feed')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .eq('is_archived', false)
      // WhatsApp's status broadcast is a pseudo-chat, never a conversation.
      // Older rows carry no platform_chat_id, so match the name too.
      .not('platform_chat_id', 'eq', 'status@broadcast')
      .not('chat_name', 'eq', 'WhatsApp Status Broadcast')
      .order('last_activity_at', { ascending: false })
      .order('chat_id', { ascending: false })
      .limit(limit + 1);

    if (cursor) {
      query = query.or(
        `last_activity_at.lt.${cursor.lastActivityAt},` +
        `and(last_activity_at.eq.${cursor.lastActivityAt},chat_id.lt.${cursor.chatId})`,
      );
    }
    if (platform) query = query.eq('platform', platform);
    if (filter === 'unread') query = query.gt('unread_count', 0);
    if (filter === 'groups') query = query.eq('is_group', true);
    if (filter === 'needs_reply') query = query.eq('last_message_from_me', false);
    if (search) {
      // Search every conversation in the database rather than the page the
      // client happens to hold. Commas and parens would break PostgREST's
      // filter grammar, so drop them from the pattern.
      const pattern = `%${search.replace(/[,()]/g, ' ')}%`;
      query = query.or(
        `chat_name.ilike.${pattern},` +
        `contact_name.ilike.${pattern},` +
        `contact_inferred_name.ilike.${pattern},` +
        `contact_phone.ilike.${pattern},` +
        `last_message_content.ilike.${pattern}`,
      );
    }

    const { data, error, count } = await query;
    if (error) throw error;

    const rows = data || [];
    const hasMore = rows.length > limit;
    const conversations = hasMore ? rows.slice(0, limit) : rows;

    return res.json({
      success: true,
      data: {
        conversations,
        nextCursor: hasMore && conversations.length
          ? encodeCursor(conversations[conversations.length - 1] as DbRow)
          : null,
        hasMore,
        total: count ?? null,
      },
    });
  } catch (error) {
    logger.error('Error fetching conversation feed:', error);
    return res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

/**
 * GET /conversations/:chatId/settings
 * Fetch category + profile + smart cards for a conversation
 */
router.get('/:chatId/settings', requireAuth, async (req: Request, res: Response) => {
  try {
    const { chatId } = req.params;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const [categoryRes, profileRes, cardsRes] = await Promise.all([
      supabase
        .from('chat_categories')
        .select('*')
        .eq('chat_id', chatId)
        .eq('user_id', userId)
        .single(),
      supabase
        .from('contact_profiles')
        .select('*')
        .eq('chat_id', chatId)
        .eq('user_id', userId)
        .single(),
      supabase
        .from('smart_cards')
        .select('*')
        .eq('chat_id', chatId)
        .eq('user_id', userId)
        .eq('dismissed', false)
        .order('priority', { ascending: false }),
    ]);

    return res.json({
      success: true,
      data: {
        category: categoryRes.data?.category || null,
        profile: profileRes.data || null,
        smartCards: cardsRes.data || [],
      },
    });
  } catch (error) {
    logger.error('Error fetching conversation settings:', error);
    return res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

/**
 * PUT /conversations/:chatId/category
 * Upsert chat category, then regenerate smart cards
 */
router.put('/:chatId/category', requireAuth, async (req: Request, res: Response) => {
  try {
    const { chatId } = req.params;
    const { category } = req.body;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const valid = ['personal', 'friend', 'business', 'trip', 'romantic'];
    if (!valid.includes(category)) {
      return res.status(400).json({ error: `Invalid category. Must be one of: ${valid.join(', ')}` });
    }

    const { data, error } = await supabase
      .from('chat_categories')
      .upsert({
        user_id: userId,
        chat_id: chatId,
        category,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,chat_id' })
      .select()
      .single();

    if (error) throw error;

    // Regenerate smart cards in the background
    smartCardGenerator.generateCards(chatId, userId).catch(err =>
      logger.error('Background smart card generation failed:', err)
    );

    return res.json({ success: true, data });
  } catch (error) {
    logger.error('Error setting category:', error);
    return res.status(500).json({ error: 'Failed to set category' });
  }
});

/**
 * PUT /conversations/:chatId/profile
 * Upsert contact profile fields
 */
router.put('/:chatId/profile', requireAuth, async (req: Request, res: Response) => {
  try {
    const { chatId } = req.params;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const allowedFields = ['display_name', 'email', 'phone_number', 'location', 'relationship_context', 'ai_instruction'];
    const updates: Record<string, string> = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        if (field === 'ai_instruction' && (typeof req.body[field] !== 'string' || req.body[field].length > 1500)) {
          return res.status(400).json({ error: 'Conversation instruction must be 1,500 characters or less' });
        }
        updates[field] = req.body[field];
      }
    }

    const { data, error } = await supabase
      .from('contact_profiles')
      .upsert({
        user_id: userId,
        chat_id: chatId,
        ...updates,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,chat_id' })
      .select()
      .single();

    if (error) throw error;

    return res.json({ success: true, data });
  } catch (error) {
    logger.error('Error updating profile:', error);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
});

/**
 * POST /conversations/:chatId/smart-cards
 * Generate smart cards via AI
 */
router.post('/:chatId/smart-cards', requireAuth, async (req: Request, res: Response) => {
  try {
    const { chatId } = req.params;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    await smartCardGenerator.generateCards(chatId, userId);

    // Fetch the persisted cards (with IDs)
    const { data: savedCards } = await supabase
      .from('smart_cards')
      .select('*')
      .eq('chat_id', chatId)
      .eq('user_id', userId)
      .eq('dismissed', false)
      .order('priority', { ascending: false });

    return res.json({ success: true, data: savedCards || [] });
  } catch (error) {
    logger.error('Error generating smart cards:', error);
    return res.status(500).json({ error: 'Failed to generate smart cards' });
  }
});

/**
 * DELETE /conversations/:chatId/smart-cards/:cardId
 * Dismiss a smart card
 */
router.delete('/:chatId/smart-cards/:cardId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { chatId, cardId } = req.params;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { error } = await supabase
      .from('smart_cards')
      .update({ dismissed: true })
      .eq('id', cardId)
      .eq('chat_id', chatId)
      .eq('user_id', userId);

    if (error) throw error;

    return res.json({ success: true });
  } catch (error) {
    logger.error('Error dismissing smart card:', error);
    return res.status(500).json({ error: 'Failed to dismiss card' });
  }
});

/**
 * POST /conversations/:chatId/smart-cards/:cardId/acted
 * Mark a smart card as acted on
 */
router.post('/:chatId/smart-cards/:cardId/acted', requireAuth, async (req: Request, res: Response) => {
  try {
    const { chatId, cardId } = req.params;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { error } = await supabase
      .from('smart_cards')
      .update({ acted_on: true })
      .eq('id', cardId)
      .eq('chat_id', chatId)
      .eq('user_id', userId);

    if (error) throw error;

    return res.json({ success: true });
  } catch (error) {
    logger.error('Error marking card as acted:', error);
    return res.status(500).json({ error: 'Failed to update card' });
  }
});

/**
 * POST /conversations/:chatId/refresh-insights
 * Re-extract key facts from conversation via AI
 */
router.post('/:chatId/refresh-insights', requireAuth, async (req: Request, res: Response) => {
  try {
    const { chatId } = req.params;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const keyFacts = await extractKeyFacts(chatId, userId);

    // Upsert into contact_profiles
    const { data, error } = await supabase
      .from('contact_profiles')
      .upsert({
        user_id: userId,
        chat_id: chatId,
        key_facts: keyFacts,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,chat_id' })
      .select()
      .single();

    if (error) throw error;

    return res.json({ success: true, data });
  } catch (error) {
    logger.error('Error refreshing insights:', error);
    return res.status(500).json({ error: 'Failed to refresh insights' });
  }
});

/**
 * Extract key facts about a contact from their message history using AI
 */
async function extractKeyFacts(
  chatId: string,
  userId: string
): Promise<Array<{ fact: string; confidence: number; source: string }>> {
  const OpenAI = (await import('openai')).default;
  const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

  const { data: messages } = await supabase
    .from('messages')
    .select('content, from_me, timestamp, contact_name')
    .eq('chat_id', chatId)
    .eq('user_id', userId)
    .not('content', 'is', null)
    .order('timestamp', { ascending: false })
    .limit(100);

  if (!messages || messages.length < 3) return [];

  const messagesText = messages
    .reverse()
    .map((m: DbRow) => `${m.from_me ? 'Me' : (m.contact_name || 'Them')}: ${m.content}`)
    .join('\n');

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: `You analyze conversations and extract factual information about the contact (the other person, NOT "Me").

Extract facts like:
- Where they live / are from
- Their job or profession
- Hobbies and interests
- Relationship status
- Important dates (birthday, anniversary)
- Preferences (food, music, etc.)
- Current life events

Return JSON: { "facts": [{ "fact": "Lives in Brooklyn, NY", "confidence": 0.9, "source": "mentioned directly" }] }
Only include facts you're reasonably confident about (confidence >= 0.5). Max 10 facts.`,
        },
        { role: 'user', content: `Conversation (${messages.length} messages):\n${messagesText}` },
      ],
      temperature: 0.3,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0].message.content || '{}';
    const parsed = JSON.parse(content);
    return (parsed.facts || []).filter(
      (f: any) => f.fact && typeof f.confidence === 'number' && f.confidence >= 0.5
    );
  } catch (error) {
    logger.error('Error extracting key facts:', error);
    return [];
  }
}

export default router;
