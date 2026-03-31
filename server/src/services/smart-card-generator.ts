import OpenAI from 'openai';
import { config } from '../config';
import { logger } from '../utils/logger';
import { supabase } from './supabase';

type ChatCategory = 'personal' | 'friend' | 'business' | 'trip' | 'romantic';
type SmartCardType = 'maps' | 'flight' | 'datetime' | 'reminder' | 'action';

interface GeneratedCard {
  card_type: SmartCardType;
  title: string;
  subtitle?: string;
  payload: Record<string, unknown>;
  priority: number;
}

const VALID_CARD_TYPES: SmartCardType[] = ['maps', 'flight', 'datetime', 'reminder', 'action'];

const SYSTEM_PROMPT_BASE = `You are Claire, a personal AI messaging assistant. You analyze conversations and generate actionable smart card suggestions. You return structured JSON only.

Generate 3-5 smart card suggestions. Each card must have:
- card_type: one of "maps", "flight", "datetime", "reminder", "action"
- title: short, clear (max 40 chars)
- subtitle: context line (max 80 chars)
- payload: structured data for the card type
- priority: 1-10 (10 = most important)

Return JSON: { "cards": [...] }`;

const CATEGORY_PROMPTS: Record<ChatCategory, string> = {
  trip: `This is a TRIP/TRAVEL group conversation. Focus on logistics and planning.

Prioritize these card types:
1. "flight" cards — if destinations or travel dates are mentioned, suggest flight searches with origin/destination extracted from context.
2. "maps" cards — suggest hotels, restaurants, and attractions at the destination.
3. "datetime" cards — if date ranges are being discussed, suggest finalizing dates.
4. "action" cards — suggest practical next steps: "Book accommodation", "Create shared itinerary", "Split costs estimate", "Check visa requirements"

Do NOT generate romantic-type suggestions.
If no destination is mentioned yet, generate an action card: "Pick a destination" with quick_picks of 3 trending destinations.`,

  romantic: `This is a ROMANTIC conversation. The user is dating or interested in this person.
Be warm, thoughtful, and encouraging. Never be creepy or manipulative.

Prioritize these card types:
1. "reminder" cards — generate nudges like "Text good morning", "Plan something for the weekend", "Check in — you haven't messaged in a while"
2. "maps" cards — suggest date spots: restaurants, cafes, parks, activities near the user.
3. "datetime" cards — suggest scheduling a date. If a date was discussed, propose finalizing it.
4. "action" cards — thoughtful gestures: "Send a song recommendation", "Share something funny", "Plan a surprise date"

Never suggest anything too forward too fast. Match the energy of the conversation.`,

  business: `This is a BUSINESS/PROFESSIONAL conversation. Keep suggestions crisp and action-oriented.

Prioritize these card types:
1. "reminder" cards — follow-up nudges: "Follow up on topic", "Send meeting recap", "Invoice reminder"
2. "datetime" cards — meeting scheduling. Extract proposed times and suggest confirming.
3. "action" cards — professional next steps: "Draft proposal", "Share document", "Schedule follow-up call"
4. "maps" cards — ONLY if a meeting location is being discussed

Tone: professional, efficient. No casual suggestions. Focus on deliverables, deadlines, and follow-through.`,

  friend: `This is a FRIEND conversation. Keep it fun, casual, and social.

Prioritize these card types:
1. "reminder" cards — social nudges: "Catch up — you haven't talked in a while", "Their birthday is coming up", "Follow up on plans"
2. "maps" cards — suggest hangout spots: bars, restaurants, activity venues, parks. Prefer casual/fun over formal.
3. "datetime" cards — if hangout plans are being discussed, suggest locking in a date.
4. "action" cards — social ideas: "Plan a game night", "Start a group activity", "Send that recommendation"

Keep the energy fun and low-pressure.`,

  personal: `This is a PERSONAL conversation (family member, close personal contact, or general).

Prioritize these card types:
1. "reminder" cards — caring check-ins: "Check in on them", "It's been a while — send a message", "Remember to do that thing"
2. "action" cards — thoughtful gestures: "Send a photo", "Ask how that thing went", "Share an article they'd like"
3. "maps" cards — only if meeting up was discussed
4. "datetime" cards — only if a visit or event was being planned

Be warm and genuine. Personal conversations deserve thoughtful, not transactional, suggestions.`,
};

class SmartCardGenerator {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });
  }

  async generateCards(chatId: string, userId: string): Promise<GeneratedCard[]> {
    // Fetch category
    const { data: categoryRow } = await supabase
      .from('chat_categories')
      .select('category')
      .eq('chat_id', chatId)
      .eq('user_id', userId)
      .single();

    if (!categoryRow) {
      logger.info(`No category set for chat ${chatId}, skipping card generation`);
      return [];
    }

    const category = categoryRow.category as ChatCategory;

    // Fetch recent messages
    const { data: messages } = await supabase
      .from('messages')
      .select('content, from_me, timestamp, contact_name')
      .eq('chat_id', chatId)
      .eq('user_id', userId)
      .not('content', 'is', null)
      .order('timestamp', { ascending: false })
      .limit(50);

    // Fetch contact profile
    const { data: profile } = await supabase
      .from('contact_profiles')
      .select('display_name, location, key_facts, relationship_context')
      .eq('chat_id', chatId)
      .eq('user_id', userId)
      .single();

    const messagesText = (messages || [])
      .reverse()
      .map(m => `${m.from_me ? 'Me' : (m.contact_name || 'Them')}: ${m.content}`)
      .join('\n');

    const profileJson = profile ? JSON.stringify({
      name: profile.display_name,
      location: profile.location,
      key_facts: profile.key_facts,
      relationship_context: profile.relationship_context,
    }) : '{}';

    const systemPrompt = `${SYSTEM_PROMPT_BASE}\n\n${CATEGORY_PROMPTS[category]}`;
    const userPrompt = `Category: ${category}\nContact profile: ${profileJson}\nRecent messages (last ${messages?.length || 0}):\n${messagesText}`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.8,
        max_tokens: 1000,
        response_format: { type: 'json_object' },
      });

      const content = completion.choices[0].message.content || '{}';
      const parsed = JSON.parse(content);
      const rawCards: GeneratedCard[] = parsed.cards || [];

      // Validate cards
      const validCards = rawCards.filter(card =>
        VALID_CARD_TYPES.includes(card.card_type) &&
        card.title &&
        card.title.length <= 60 &&
        typeof card.priority === 'number'
      );

      // Persist to DB: clear old non-acted-on cards, then insert new ones
      await supabase
        .from('smart_cards')
        .delete()
        .eq('chat_id', chatId)
        .eq('user_id', userId)
        .eq('acted_on', false)
        .eq('dismissed', false);

      if (validCards.length > 0) {
        await supabase.from('smart_cards').insert(
          validCards.map(card => ({
            user_id: userId,
            chat_id: chatId,
            card_type: card.card_type,
            title: card.title,
            subtitle: card.subtitle || null,
            payload: card.payload || {},
            priority: card.priority,
          }))
        );
      }

      logger.info(`Generated ${validCards.length} smart cards for chat ${chatId} (category: ${category})`);
      return validCards;
    } catch (error) {
      logger.error('Error generating smart cards:', error);
      return [];
    }
  }
}

export const smartCardGenerator = new SmartCardGenerator();
