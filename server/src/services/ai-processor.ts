import AnthropicBedrock from '@anthropic-ai/bedrock-sdk';
import OpenAI from 'openai';
import { aiConfig } from '../config';
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

class AIProcessor {
  private bedrock: AnthropicBedrock | null;
  private kimiClient: OpenAI | null;
  private responseAnalytics: Map<string, ResponseAnalytics> = new Map();

  constructor() {
    this.bedrock =
      aiConfig.bedrock.accessKeyId && aiConfig.bedrock.secretAccessKey
        ? new AnthropicBedrock({
            awsAccessKey: aiConfig.bedrock.accessKeyId,
            awsSecretKey: aiConfig.bedrock.secretAccessKey,
            awsRegion: aiConfig.bedrock.region,
          })
        : null;

    this.kimiClient = aiConfig.kimi.apiKey
      ? new OpenAI({ apiKey: aiConfig.kimi.apiKey, baseURL: aiConfig.kimi.baseUrl })
      : null;
  }

  /**
   * Call the configured AI provider, with fallback to the other provider on failure.
   */
  private async callAI(systemPrompt: string, userPrompt: string): Promise<string> {
    const provider = aiConfig.provider;

    const callBedrock = async () => {
      if (!this.bedrock) throw new Error('Bedrock not configured');
      const msg = await this.bedrock.messages.create({
        model: aiConfig.bedrock.model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });
      const block = msg.content[0];
      return block.type === 'text' ? block.text : '{}';
    };

    const callKimi = async () => {
      if (!this.kimiClient) throw new Error('Kimi not configured');
      const completion = await this.kimiClient.chat.completions.create({
        model: aiConfig.kimi.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 1024,
      });
      return completion.choices[0].message.content || '{}';
    };

    const [primary, fallback] =
      provider === 'bedrock' ? [callBedrock, callKimi] : [callKimi, callBedrock];

    try {
      return await primary();
    } catch (err) {
      logger.warn(`Primary AI provider (${provider}) failed, trying fallback:`, (err as Error).message);
    }

    return await fallback();
  }

  /**
   * Generate response suggestions for a message.
   */
  async generateResponse(
    messageId: string,
    content: string,
    userId: string,
    chatType: 'individual' | 'group'
  ): Promise<AIResponse> {
    try {
      const cachedResponse = await responseCache.get(content, userId);
      if (cachedResponse) {
        logger.info(`Using cached response for message ${messageId}`);
        return { ...cachedResponse, messageId, cached: true };
      }

      const conversationContext = await contextBuilder.buildContext(messageId, userId);
      const messageType = promptTemplates.detectMessageType(content);

      const tone = conversationContext.userPreferences?.tone || 'friendly';
      const style = conversationContext.userPreferences?.responseStyle || 'concise';
      const language = conversationContext.userPreferences?.language || 'en';

      const promptContext = {
        messageType,
        chatType,
        relationship:
          conversationContext.contact?.relationship ||
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

      // Ensure JSON output — Anthropic doesn't have response_format but respects the instruction
      const systemWithJson = `${system}\n\nYou MUST respond with valid JSON only, no markdown or explanation.`;

      const rawContent = await this.callAI(systemWithJson, user);
      const response = this.parseAIResponse(rawContent, messageId, messageType);

      const safeResponse = await responseSafety.validateAndFilter(response, conversationContext);
      await responseCache.setWithConfidenceTTL(content, userId, safeResponse);
      this.trackResponseAnalytics(messageId, userId, safeResponse, conversationContext);

      return safeResponse;
    } catch (error) {
      logger.error('Error generating AI response:', error);
      throw error;
    }
  }

  /**
   * Generate response suggestions and persist them to ai_suggestions table.
   * Call this from the message ingestion pipeline with the DB message UUID.
   */
  async generateAndStore(
    messageDbId: string,
    content: string,
    userId: string,
    chatType: 'individual' | 'group'
  ): Promise<AIResponse> {
    const response = await this.generateResponse(messageDbId, content, userId, chatType);

    const { error } = await supabase.from('ai_suggestions').upsert(
      {
        user_id: userId,
        message_id: messageDbId,
        suggestions: response.suggestions,
        confidence: response.confidence,
        reasoning: response.reasoning,
      },
      { onConflict: 'message_id' }
    );

    if (error) {
      logger.error('Failed to store AI suggestion:', error);
    } else {
      logger.debug(`AI suggestion stored for message ${messageDbId}`);
    }

    return response;
  }

  /**
   * Parse the AI JSON response into an AIResponse object.
   */
  private parseAIResponse(content: string, messageId: string, messageType: string): AIResponse {
    try {
      // Strip markdown code fences if present
      const clean = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      const parsed = JSON.parse(clean);
      return {
        messageId,
        suggestions: parsed.suggestions || ['I understand.', 'Thanks for letting me know.'],
        confidence: Math.min(Math.max(parsed.confidence || 0.7, 0), 1),
        reasoning: parsed.reasoning,
        messageType,
      };
    } catch {
      logger.warn('Failed to parse AI response, using fallback');
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
   * Track in-memory analytics for the session.
   */
  private trackResponseAnalytics(
    messageId: string,
    userId: string,
    response: AIResponse,
    context: any
  ) {
    this.responseAnalytics.set(messageId, {
      messageId,
      userId,
      messageType: response.messageType || 'unknown',
      confidence: response.confidence,
      suggestionCount: response.suggestions.length,
      contextMessageCount: context.messages?.length || 0,
      hasContactInfo: !!context.contact,
      responseTime: Date.now(),
      cached: response.cached || false,
    });
  }

  /**
   * Get analytics from ai_suggestions table.
   */
  async getAnalytics(userId: string, dateRange?: { start: Date; end: Date }) {
    const { data } = await supabase
      .from('ai_suggestions')
      .select('*')
      .eq('user_id', userId)
      .gte(
        'created_at',
        dateRange?.start?.toISOString() ||
          new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      )
      .lte('created_at', dateRange?.end?.toISOString() || new Date().toISOString());

    if (!data) return null;

    return {
      totalSuggestions: data.length,
      averageConfidence: data.reduce((sum, r) => sum + (r.confidence || 0), 0) / data.length,
      selectionRate: data.filter((r) => r.selected_index !== null).length / data.length,
      messageTypes: this.groupByMessageType(data),
      qualityScore: this.calculateQualityScore(data),
    };
  }

  private groupByMessageType(data: any[]) {
    const groups: { [key: string]: number } = {};
    data.forEach((item) => {
      const type = item.message_type || 'unknown';
      groups[type] = (groups[type] || 0) + 1;
    });
    return groups;
  }

  private calculateQualityScore(data: any[]): number {
    if (data.length === 0) return 0;
    const avgConfidence = data.reduce((sum, r) => sum + (r.confidence || 0), 0) / data.length;
    const selectionRate = data.filter((r) => r.selected_index !== null).length / data.length;
    const positiveFeedback = data.filter((r) => r.feedback === 'positive').length / data.length;
    return avgConfidence * 0.4 + selectionRate * 0.4 + positiveFeedback * 0.2;
  }

  /**
   * Update user feedback for a suggestion.
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
   * Analyze message sentiment using Bedrock.
   */
  async analyzeSentiment(content: string): Promise<string> {
    try {
      const result = await this.callAI(
        'Classify the sentiment of the message. Return exactly one word: positive, negative, neutral, or mixed.',
        content
      );
      const sentiment = result.trim().toLowerCase();
      if (['positive', 'negative', 'neutral', 'mixed'].includes(sentiment)) return sentiment;
      return 'neutral';
    } catch (error) {
      logger.error('Error analyzing sentiment:', error);
      return 'neutral';
    }
  }

  /**
   * Extract key topics from a message using Bedrock.
   */
  async extractTopics(content: string): Promise<string[]> {
    try {
      const result = await this.callAI(
        'Extract key topics from the message. Return a JSON object with a "topics" array of strings. No markdown.',
        content
      );
      const parsed = JSON.parse(result.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim());
      return parsed.topics || [];
    } catch (error) {
      logger.error('Error extracting topics:', error);
      return [];
    }
  }
}

export const aiProcessor = new AIProcessor();
