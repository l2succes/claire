import { logger } from '../utils/logger';
import { supabase } from './supabase';

interface ConversationContext {
  messages: ContextMessage[];
  contact: ContactContext | null;
  userPreferences: UserPreferences | null;
  metadata: ContextMetadata;
}

interface ContextMessage {
  id: string;
  content: string;
  fromMe: boolean;
  timestamp: Date;
  type: string;
}

interface ContactContext {
  name?: string;
  relationship?: string;
  notes?: string;
  inferredName?: string;
  inferredRelationship?: string;
  confidence?: number;
}

interface UserPreferences {
  tone: string;
  responseStyle: string;
  language: string;
  personalityTraits?: string[];
}

interface ContextMetadata {
  chatType: 'individual' | 'group';
  messageCount: number;
  averageResponseTime?: number;
  lastInteractionTime?: Date;
  conversationTopic?: string;
}

export class ContextBuilder {
  /**
   * Build comprehensive context for AI processing
   */
  async buildContext(
    messageId: string,
    userId: string,
    maxMessages: number = 20
  ): Promise<ConversationContext> {
    try {
      // Get the current message to determine the chat
      const { data: currentMessage } = await supabase
        .from('messages')
        .select('chat_id, contact_id')
        .eq('whatsapp_id', messageId)
        .single();

      if (!currentMessage) {
        throw new Error(`Message ${messageId} not found`);
      }

      // Build context components in parallel
      const [messages, contact, userPreferences, metadata] = await Promise.all([
        this.getRecentMessages(currentMessage.chat_id, userId, maxMessages),
        this.getContactContext(currentMessage.contact_id, userId),
        this.getUserPreferences(userId),
        this.getConversationMetadata(currentMessage.chat_id, userId),
      ]);

      return {
        messages,
        contact,
        userPreferences,
        metadata,
      };
    } catch (error) {
      logger.error('Error building conversation context:', error);
      // Return minimal context on error
      return {
        messages: [],
        contact: null,
        userPreferences: null,
        metadata: {
          chatType: 'individual',
          messageCount: 0,
        },
      };
    }
  }

  /**
   * Get recent messages from the conversation
   */
  private async getRecentMessages(
    chatId: string,
    userId: string,
    limit: number
  ): Promise<ContextMessage[]> {
    const { data: messages } = await supabase
      .from('messages')
      .select('id, whatsapp_id, content, from_me, timestamp, type')
      .eq('chat_id', chatId)
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (!messages) return [];

    return messages.reverse().map(msg => ({
      id: msg.whatsapp_id,
      content: msg.content || '',
      fromMe: msg.from_me,
      timestamp: new Date(msg.timestamp),
      type: msg.type || 'text',
    }));
  }

  /**
   * Get contact information and inferences
   */
  private async getContactContext(
    contactId: string | null,
    userId: string
  ): Promise<ContactContext | null> {
    if (!contactId) return null;

    const { data: contact } = await supabase
      .from('contacts')
      .select('name, notes, inferred_name, inferred_relationship, inference_confidence')
      .eq('whatsapp_id', contactId)
      .eq('user_id', userId)
      .single();

    if (!contact) return null;

    return {
      name: contact.name,
      notes: contact.notes,
      inferredName: contact.inferred_name,
      inferredRelationship: contact.inferred_relationship,
      confidence: contact.inference_confidence,
    };
  }

  /**
   * Get user preferences for AI responses
   */
  private async getUserPreferences(userId: string): Promise<UserPreferences | null> {
    const { data: prefs } = await supabase
      .from('user_preferences')
      .select('tone, response_style, language, preferences')
      .eq('user_id', userId)
      .single();

    if (!prefs) return null;

    return {
      tone: prefs.tone || 'friendly',
      responseStyle: prefs.response_style || 'concise',
      language: prefs.language || 'en',
      personalityTraits: prefs.preferences?.personality || [],
    };
  }

  /**
   * Get conversation metadata for context
   */
  private async getConversationMetadata(
    chatId: string,
    userId: string
  ): Promise<ContextMetadata> {
    // Get chat info
    const { data: chat } = await supabase
      .from('chats')
      .select('is_group, last_message_at')
      .eq('id', chatId)
      .single();

    // Get message count
    const { count } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('chat_id', chatId)
      .eq('user_id', userId);

    // Get average response time (last 10 conversations)
    const avgResponseTime = await this.calculateAverageResponseTime(chatId, userId);

    // Infer conversation topic from recent messages
    const topic = await this.inferConversationTopic(chatId, userId);

    return {
      chatType: chat?.is_group ? 'group' : 'individual',
      messageCount: count || 0,
      averageResponseTime: avgResponseTime,
      lastInteractionTime: chat?.last_message_at ? new Date(chat.last_message_at) : undefined,
      conversationTopic: topic,
    };
  }

  /**
   * Calculate average response time between messages
   */
  private async calculateAverageResponseTime(
    chatId: string,
    userId: string
  ): Promise<number | undefined> {
    const { data: messages } = await supabase
      .from('messages')
      .select('timestamp, from_me')
      .eq('chat_id', chatId)
      .eq('user_id', userId)
      .order('timestamp', { ascending: true })
      .limit(20);

    if (!messages || messages.length < 4) return undefined;

    const responseTimes: number[] = [];
    
    for (let i = 1; i < messages.length; i++) {
      const current = messages[i];
      const previous = messages[i - 1];
      
      // Look for user response to incoming message
      if (current.from_me && !previous.from_me) {
        const responseTime = new Date(current.timestamp).getTime() - 
                           new Date(previous.timestamp).getTime();
        
        // Only include reasonable response times (< 24 hours)
        if (responseTime > 0 && responseTime < 24 * 60 * 60 * 1000) {
          responseTimes.push(responseTime);
        }
      }
    }

    if (responseTimes.length === 0) return undefined;

    return responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
  }

  /**
   * Infer conversation topic from recent messages
   */
  private async inferConversationTopic(
    chatId: string,
    userId: string
  ): Promise<string | undefined> {
    const { data: recentMessages } = await supabase
      .from('messages')
      .select('content')
      .eq('chat_id', chatId)
      .eq('user_id', userId)
      .eq('type', 'text')
      .not('content', 'is', null)
      .order('timestamp', { ascending: false })
      .limit(5);

    if (!recentMessages || recentMessages.length === 0) return undefined;

    // Simple keyword-based topic detection
    const allContent = recentMessages
      .map(m => m.content?.toLowerCase() || '')
      .join(' ');

    const topics = [
      { keywords: ['work', 'job', 'meeting', 'project', 'deadline', 'office'], topic: 'work' },
      { keywords: ['family', 'mom', 'dad', 'sister', 'brother', 'parents'], topic: 'family' },
      { keywords: ['vacation', 'travel', 'trip', 'flight', 'hotel'], topic: 'travel' },
      { keywords: ['health', 'doctor', 'sick', 'appointment', 'medicine'], topic: 'health' },
      { keywords: ['food', 'dinner', 'lunch', 'restaurant', 'cooking'], topic: 'food' },
      { keywords: ['plans', 'weekend', 'party', 'event', 'celebration'], topic: 'social' },
    ];

    for (const { keywords, topic } of topics) {
      const matchCount = keywords.filter(keyword => allContent.includes(keyword)).length;
      if (matchCount >= 2) {
        return topic;
      }
    }

    return undefined;
  }

  /**
   * Format context for AI prompt
   */
  formatForPrompt(context: ConversationContext): string {
    let prompt = '';

    // Add conversation history
    if (context.messages.length > 0) {
      prompt += 'Recent conversation:\n';
      context.messages.forEach(msg => {
        const sender = msg.fromMe ? 'You' : 'Them';
        prompt += `${sender}: ${msg.content}\n`;
      });
      prompt += '\n';
    }

    // Add contact context
    if (context.contact) {
      prompt += 'Contact information:\n';
      if (context.contact.name) {
        prompt += `Name: ${context.contact.name}\n`;
      }
      if (context.contact.inferredName && !context.contact.name) {
        prompt += `Inferred name: ${context.contact.inferredName}\n`;
      }
      if (context.contact.relationship || context.contact.inferredRelationship) {
        const relationship = context.contact.relationship || context.contact.inferredRelationship;
        prompt += `Relationship: ${relationship}\n`;
      }
      if (context.contact.notes) {
        prompt += `Notes: ${context.contact.notes}\n`;
      }
      prompt += '\n';
    }

    // Add user preferences
    if (context.userPreferences) {
      prompt += 'Response preferences:\n';
      prompt += `Tone: ${context.userPreferences.tone}\n`;
      prompt += `Style: ${context.userPreferences.responseStyle}\n`;
      prompt += `Language: ${context.userPreferences.language}\n`;
      if (context.userPreferences.personalityTraits?.length) {
        prompt += `Personality: ${context.userPreferences.personalityTraits.join(', ')}\n`;
      }
      prompt += '\n';
    }

    // Add conversation metadata
    prompt += 'Context:\n';
    prompt += `Chat type: ${context.metadata.chatType}\n`;
    prompt += `Message count: ${context.metadata.messageCount}\n`;
    
    if (context.metadata.conversationTopic) {
      prompt += `Topic: ${context.metadata.conversationTopic}\n`;
    }

    if (context.metadata.averageResponseTime) {
      const avgMinutes = Math.round(context.metadata.averageResponseTime / (1000 * 60));
      prompt += `Typical response time: ${avgMinutes} minutes\n`;
    }

    return prompt;
  }
}

// Export singleton instance
export const contextBuilder = new ContextBuilder();