import OpenAI from 'openai';
import { config } from '../config';
import { logger } from '../utils/logger';
import { supabase } from './supabase';
import { contextBuilder } from './context-builder';
import { promptTemplates } from './prompt-templates';
import { responseCache } from './response-cache';
import { responseSafety } from './response-safety';

interface AIResponse {
  messageId: string;
  suggestions: string[];
  confidence: number;
  reasoning?: string;
  messageType?: string;
  cached?: boolean;
}

interface StreamingCallback {
  onToken?: (token: string) => void;
  onComplete?: (response: AIResponse) => void;
  onError?: (error: Error) => void;
}

class AIProcessor {
  private openai: OpenAI;
  private responseAnalytics: Map<string, ResponseAnalytics> = new Map();

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
    chatType: 'individual' | 'group',
    streaming?: StreamingCallback
  ): Promise<AIResponse> {
    try {
      // Check cache first
      const cachedResponse = await responseCache.get(content, userId);
      if (cachedResponse) {
        logger.info(`Using cached response for message ${messageId}`);
        const response = { ...cachedResponse, messageId, cached: true };
        streaming?.onComplete?.(response);
        return response;
      }

      // Build comprehensive context
      const conversationContext = await contextBuilder.buildContext(messageId, userId);
      
      // Detect message type
      const messageType = promptTemplates.detectMessageType(content);
      
      // Get user preferences for tone and style
      const tone = conversationContext.userPreferences?.tone || 'friendly';
      const style = conversationContext.userPreferences?.responseStyle || 'concise';
      const language = conversationContext.userPreferences?.language || 'en';
      
      // Build context-aware prompt
      const promptContext = {
        messageType,
        chatType,
        relationship: conversationContext.contact?.relationship || 
                     conversationContext.contact?.inferredRelationship,
        tone,
        style,
        language,
      };

      const { system, user } = promptTemplates.buildPrompt(
        content,
        messageType,
        promptContext,
        contextBuilder.formatForPrompt(conversationContext),
        3
      );

      // Generate response with streaming support
      const response = await this.generateWithStreaming(
        messageId,
        system,
        user,
        messageType,
        streaming
      );

      // Validate response safety
      const safeResponse = await responseSafety.validateAndFilter(response, conversationContext);

      // Cache the response
      await responseCache.set(content, userId, safeResponse);

      // Track analytics
      this.trackResponseAnalytics(messageId, userId, safeResponse, conversationContext);

      return safeResponse;
    } catch (error) {
      logger.error('Error generating AI response:', error);
      streaming?.onError?.(error as Error);
      throw error;
    }
  }

  /**
   * Generate response with streaming support
   */
  private async generateWithStreaming(
    messageId: string,
    systemPrompt: string,
    userPrompt: string,
    messageType: string,
    streaming?: StreamingCallback
  ): Promise<AIResponse> {
    if (streaming?.onToken) {
      // Streaming mode
      const stream = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 500,
        response_format: { type: 'json_object' },
        stream: true,
      });

      let fullContent = '';
      
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || '';
        if (delta) {
          fullContent += delta;
          streaming.onToken(delta);
        }
      }

      const result = this.parseAIResponse(fullContent, messageId, messageType);
      streaming?.onComplete?.(result);
      return result;
    } else {
      // Non-streaming mode
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      });

      const content = completion.choices[0].message.content || '{}';
      return this.parseAIResponse(content, messageId, messageType);
    }
  }

  /**
   * Parse AI response from JSON
   */
  private parseAIResponse(content: string, messageId: string, messageType: string): AIResponse {
    try {
      const parsed = JSON.parse(content);
      return {
        messageId,
        suggestions: parsed.suggestions || ['I understand.', 'Thanks for letting me know.'],
        confidence: Math.min(Math.max(parsed.confidence || 0.7, 0), 1),
        reasoning: parsed.reasoning,
        messageType,
      };
    } catch (error) {
      logger.warn('Failed to parse AI response, using fallback:', error);
      return {
        messageId,
        suggestions: ['I understand.', 'Thanks for sharing that with me.'],
        confidence: 0.5,
        reasoning: 'Fallback response due to parsing error',
        messageType,
      };
    }
  }

  /**
   * Track response analytics
   */
  private trackResponseAnalytics(
    messageId: string,
    userId: string,
    response: AIResponse,
    context: any
  ) {
    const analytics: ResponseAnalytics = {
      messageId,
      userId,
      messageType: response.messageType || 'unknown',
      confidence: response.confidence,
      suggestionCount: response.suggestions.length,
      contextMessageCount: context.messages?.length || 0,
      hasContactInfo: !!context.contact,
      responseTime: Date.now(),
      cached: response.cached || false,
    };

    this.responseAnalytics.set(messageId, analytics);
  }

  /**
   * Get response analytics
   */
  async getAnalytics(userId: string, dateRange?: { start: Date; end: Date }) {
    const { data } = await supabase
      .from('ai_suggestions')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', dateRange?.start?.toISOString() || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .lte('created_at', dateRange?.end?.toISOString() || new Date().toISOString());

    if (!data) return null;

    const analytics = {
      totalSuggestions: data.length,
      averageConfidence: data.reduce((sum, r) => sum + (r.confidence || 0), 0) / data.length,
      selectionRate: data.filter(r => r.selected_index !== null).length / data.length,
      messageTypes: this.groupByMessageType(data),
      qualityScore: this.calculateQualityScore(data),
    };

    return analytics;
  }

  /**
   * Group suggestions by message type
   */
  private groupByMessageType(data: any[]) {
    const groups: { [key: string]: number } = {};
    data.forEach(item => {
      const type = item.message_type || 'unknown';
      groups[type] = (groups[type] || 0) + 1;
    });
    return groups;
  }

  /**
   * Calculate overall quality score
   */
  private calculateQualityScore(data: any[]): number {
    if (data.length === 0) return 0;

    const factors = {
      averageConfidence: data.reduce((sum, r) => sum + (r.confidence || 0), 0) / data.length,
      selectionRate: data.filter(r => r.selected_index !== null).length / data.length,
      positiveFeedback: data.filter(r => r.feedback === 'positive').length / data.length,
    };

    // Weighted quality score
    return (
      factors.averageConfidence * 0.4 +
      factors.selectionRate * 0.4 +
      factors.positiveFeedback * 0.2
    );
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
        message_type: result.messageType,
        created_at: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error storing AI suggestions:', error);
    }
  }

  /**
   * Update suggestion feedback
   */
  async updateFeedback(
    messageId: string,
    userId: string,
    selectedIndex?: number,
    feedback?: 'positive' | 'negative',
    customResponse?: string
  ) {
    try {
      await supabase
        .from('ai_suggestions')
        .update({
          selected_index: selectedIndex,
          feedback,
          custom_response: customResponse,
          updated_at: new Date().toISOString(),
        })
        .eq('message_id', messageId)
        .eq('user_id', userId);

      logger.info(`Updated feedback for suggestion ${messageId}`);
    } catch (error) {
      logger.error('Error updating suggestion feedback:', error);
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

interface ResponseAnalytics {
  messageId: string;
  userId: string;
  messageType: string;
  confidence: number;
  suggestionCount: number;
  contextMessageCount: number;
  hasContactInfo: boolean;
  responseTime: number;
  cached: boolean;
}

// Export singleton instance
export const aiProcessor = new AIProcessor();