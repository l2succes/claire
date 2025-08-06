import OpenAI from 'openai';
import { config } from '../config';
import { logger } from '../utils/logger';
import { supabase } from './supabase';

interface AIResponse {
  messageId: string;
  suggestions: string[];
  confidence: number;
  reasoning?: string;
}

class AIProcessor {
  private openai: OpenAI;
  private contextCache: Map<string, any> = new Map();

  constructor() {
    this.openai = new OpenAI({
      apiKey: config.OPENAI_API_KEY,
    });
  }

  /**
   * Generate response suggestions for a message
   */
  async generateResponse(
    messageId: string,
    content: string,
    userId: string,
    chatType: 'individual' | 'group'
  ): Promise<AIResponse> {
    try {
      // Get conversation context
      const context = await this.getConversationContext(messageId, userId);
      
      // Build prompt
      const prompt = this.buildPrompt(content, context, chatType);
      
      // Generate response with GPT-4
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          {
            role: 'system',
            content: `You are a helpful AI assistant that suggests thoughtful WhatsApp message responses. 
            Consider the conversation context, tone, and relationship. 
            Provide 2-3 response suggestions that are:
            - Natural and conversational
            - Contextually appropriate
            - Varying in tone (casual, professional, empathetic)
            ${chatType === 'group' ? 'Keep in mind this is a group chat.' : ''}`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      });

      const result = JSON.parse(completion.choices[0].message.content || '{}');
      
      // Store the suggestions
      await this.storeSuggestions(messageId, userId, result);
      
      return {
        messageId,
        suggestions: result.suggestions || [],
        confidence: result.confidence || 0.7,
        reasoning: result.reasoning,
      };
    } catch (error) {
      logger.error('Error generating AI response:', error);
      throw error;
    }
  }

  /**
   * Build prompt with context
   */
  private buildPrompt(
    content: string,
    context: any,
    chatType: string
  ): string {
    let prompt = `Recent message received: "${content}"\n\n`;
    
    if (context.recentMessages?.length > 0) {
      prompt += 'Recent conversation history:\n';
      context.recentMessages.forEach((msg: any) => {
        prompt += `${msg.fromMe ? 'Me' : 'Them'}: ${msg.content}\n`;
      });
      prompt += '\n';
    }
    
    if (context.userPreferences) {
      prompt += `User preferences: ${JSON.stringify(context.userPreferences)}\n`;
    }
    
    if (context.contactInfo) {
      prompt += `Contact info: ${JSON.stringify(context.contactInfo)}\n`;
    }
    
    prompt += `\nProvide 2-3 response suggestions in JSON format:
    {
      "suggestions": ["response1", "response2", "response3"],
      "confidence": 0.0-1.0,
      "reasoning": "brief explanation of suggestions"
    }`;
    
    return prompt;
  }

  /**
   * Get conversation context for better responses
   */
  private async getConversationContext(messageId: string, userId: string) {
    try {
      // Check cache first
      const cacheKey = `${userId}-${messageId}`;
      if (this.contextCache.has(cacheKey)) {
        return this.contextCache.get(cacheKey);
      }

      // Get recent messages from the same chat
      const { data: message } = await supabase
        .from('messages')
        .select('chat_id, contact_id')
        .eq('whatsapp_id', messageId)
        .single();

      if (!message) return {};

      // Get last 10 messages from this chat
      const { data: recentMessages } = await supabase
        .from('messages')
        .select('content, from_me, created_at')
        .eq('chat_id', message.chat_id)
        .order('created_at', { ascending: false })
        .limit(10);

      // Get user preferences
      const { data: userPreferences } = await supabase
        .from('user_preferences')
        .select('tone, response_style, auto_reply_enabled')
        .eq('user_id', userId)
        .single();

      // Get contact information
      const { data: contactInfo } = await supabase
        .from('contacts')
        .select('name, relationship, notes')
        .eq('whatsapp_id', message.contact_id)
        .single();

      const context = {
        recentMessages: recentMessages?.reverse() || [],
        userPreferences,
        contactInfo,
      };

      // Cache for 5 minutes
      this.contextCache.set(cacheKey, context);
      setTimeout(() => this.contextCache.delete(cacheKey), 5 * 60 * 1000);

      return context;
    } catch (error) {
      logger.error('Error getting conversation context:', error);
      return {};
    }
  }

  /**
   * Store AI suggestions in database
   */
  private async storeSuggestions(
    messageId: string,
    userId: string,
    result: any
  ) {
    try {
      await supabase.from('ai_suggestions').insert({
        message_id: messageId,
        user_id: userId,
        suggestions: result.suggestions,
        confidence: result.confidence,
        reasoning: result.reasoning,
        created_at: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error storing AI suggestions:', error);
    }
  }

  /**
   * Analyze message sentiment
   */
  async analyzeSentiment(content: string): Promise<string> {
    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'Analyze the sentiment of the message. Return one of: positive, negative, neutral, mixed',
          },
          {
            role: 'user',
            content,
          },
        ],
        temperature: 0,
        max_tokens: 10,
      });

      return completion.choices[0].message.content || 'neutral';
    } catch (error) {
      logger.error('Error analyzing sentiment:', error);
      return 'neutral';
    }
  }

  /**
   * Extract key topics from message
   */
  async extractTopics(content: string): Promise<string[]> {
    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'Extract key topics from the message. Return as JSON array of strings.',
          },
          {
            role: 'user',
            content,
          },
        ],
        temperature: 0,
        max_tokens: 100,
        response_format: { type: 'json_object' },
      });

      const result = JSON.parse(completion.choices[0].message.content || '{}');
      return result.topics || [];
    } catch (error) {
      logger.error('Error extracting topics:', error);
      return [];
    }
  }
}

// Export singleton instance
export const aiProcessor = new AIProcessor();