import { Router, Request, Response } from 'express';
import { config } from '../config';
import { requireAuth } from '../middleware/auth';
import { logger } from '../utils/logger';
import { supabase } from '../services/supabase';
import { smartCardGenerator } from '../services/smart-card-generator';

const router = Router();

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

    res.json({
      success: true,
      data: {
        category: categoryRes.data?.category || null,
        profile: profileRes.data || null,
        smartCards: cardsRes.data || [],
      },
    });
  } catch (error) {
    logger.error('Error fetching conversation settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
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

    res.json({ success: true, data });
  } catch (error) {
    logger.error('Error setting category:', error);
    res.status(500).json({ error: 'Failed to set category' });
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

    const allowedFields = ['display_name', 'email', 'phone_number', 'location', 'relationship_context'];
    const updates: Record<string, string> = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
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

    res.json({ success: true, data });
  } catch (error) {
    logger.error('Error updating profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
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

    const cards = await smartCardGenerator.generateCards(chatId, userId);

    // Fetch the persisted cards (with IDs)
    const { data: savedCards } = await supabase
      .from('smart_cards')
      .select('*')
      .eq('chat_id', chatId)
      .eq('user_id', userId)
      .eq('dismissed', false)
      .order('priority', { ascending: false });

    res.json({ success: true, data: savedCards || [] });
  } catch (error) {
    logger.error('Error generating smart cards:', error);
    res.status(500).json({ error: 'Failed to generate smart cards' });
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

    res.json({ success: true });
  } catch (error) {
    logger.error('Error dismissing smart card:', error);
    res.status(500).json({ error: 'Failed to dismiss card' });
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

    res.json({ success: true });
  } catch (error) {
    logger.error('Error marking card as acted:', error);
    res.status(500).json({ error: 'Failed to update card' });
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

    res.json({ success: true, data });
  } catch (error) {
    logger.error('Error refreshing insights:', error);
    res.status(500).json({ error: 'Failed to refresh insights' });
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
    .map(m => `${m.from_me ? 'Me' : (m.contact_name || 'Them')}: ${m.content}`)
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
