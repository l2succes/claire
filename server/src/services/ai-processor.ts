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

export interface ConversationExplanation {
  summary: string;
  latestMessageIntent: string;
  responseStrategy: string;
  suggestedNextStep: string;
  contextSignals: string[];
}

interface GenerateResponseOptions {
  /** A short user instruction that steers this one set of reply options. */
  guidance?: string;
  /** Generate a fresh response instead of returning a content-cache hit. */
  forceRefresh?: boolean;
}

// Bump this whenever prompt rules materially change so cached suggestions use
// the current tone and language behavior rather than a stale prompt result.
const RESPONSE_PROMPT_VERSION = 'style-language-v1';

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

export class AIProcessor {
  private bedrock: AnthropicBedrock | null;
  private kimiClient: OpenAI | null;
  private openaiClient: OpenAI | null;
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
    this.openaiClient = aiConfig.openai.apiKey
      ? new OpenAI({ apiKey: aiConfig.openai.apiKey })
      : null;

    logger.info('[ai] provider configuration', {
      provider: aiConfig.provider,
      bedrockConfigured: !!this.bedrock,
      kimiConfigured: !!this.kimiClient,
      openaiConfigured: !!this.openaiClient,
    });
  }

  /**
   * Call the configured AI provider, with fallback only when the fallback is
   * actually configured. This keeps a provider outage from being obscured by
   * a misleading "Kimi not configured" error.
   */
  get isConfigured(): boolean {
    return !!(this.bedrock || this.kimiClient || this.openaiClient);
  }

  private async callAI(systemPrompt: string, userPrompt: string): Promise<string> {
    if (!this.isConfigured) {
      throw new Error('NO_AI_PROVIDER');
    }

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

    const callOpenAI = async () => {
      if (!this.openaiClient) throw new Error('OpenAI not configured');
      const completion = await this.openaiClient.chat.completions.create({
        model: aiConfig.openai.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 1024,
      });
      return completion.choices[0].message.content || '{}';
    };

    const providers = {
      bedrock: { configured: !!this.bedrock, call: callBedrock },
      kimi: { configured: !!this.kimiClient, call: callKimi },
      openai: { configured: !!this.openaiClient, call: callOpenAI },
    };
    const preferred = aiConfig.provider;
    const orderedProviders = [preferred, ...(['openai', 'bedrock', 'kimi'] as const).filter(name => name !== preferred)];
    const failures: string[] = [];

    for (const provider of orderedProviders) {
      const candidate = providers[provider];
      if (!candidate.configured) continue;
      try {
        return await candidate.call();
      } catch (error) {
        const message = (error as Error).message || String(error);
        failures.push(`${provider}:${message}`);
        logger.warn(`[ai] provider ${provider} failed; trying next configured provider: ${message}`);
      }
    }

    throw new Error(`AI_PROVIDER_UNAVAILABLE:${preferred}:${failures.join(' | ') || 'no configured provider'}`);
  }

  /**
   * Generate response suggestions for a message.
   */
  async generateResponse(
    messageId: string,
    content: string,
    userId: string,
    chatType: 'individual' | 'group',
    options: GenerateResponseOptions = {}
  ): Promise<AIResponse> {
    try {
      const guidance = options.guidance?.trim();
      // A content-only cache leaks a reply from one conversation into another
      // whenever two contacts write the same text. Cache per actual message.
      const cacheKey = `${RESPONSE_PROMPT_VERSION}:${messageId}:${content}`;
      if (!guidance && !options.forceRefresh) {
        const cachedResponse = await responseCache.get(cacheKey, userId);
        if (cachedResponse) {
          logger.info(`Using cached response for message ${messageId}`);
          return { ...cachedResponse, messageId, cached: true };
        }
      }

      const conversationContext = await contextBuilder.buildContext(messageId, userId);
      const messageType = promptTemplates.detectMessageType(content);

      const tone = conversationContext.userPreferences?.tone || 'friendly';
      const style = conversationContext.userPreferences?.responseStyle || 'concise';
      const preferredLanguage = conversationContext.userPreferences?.language || 'en';
      const language = `the dominant language in the latest message and recent back-and-forth (use the account preference "${preferredLanguage}" only when the conversation has no clear language signal)`;

      const promptContext = {
        messageType,
        chatType,
        relationship:
          conversationContext.contact?.relationship ||
          conversationContext.contact?.inferredRelationship ||
          conversationContext.chatCategory,
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

      // OpenAI uses JSON mode below; the instruction keeps Bedrock/Kimi output
      // compatible and prevents generic fallback replies when a model drifts.
      const systemWithJson = `${system}\n\nYou MUST respond with valid JSON only, no markdown or explanation.\n\nReply quality requirements:\n- Return exactly 3 distinct, ready-to-send suggestions in a "suggestions" array.\n- Use the actual latest message and recent conversation details.\n- Make each option concrete: propose or answer the relevant plan, question, place, time, or next step when one is present.\n- Do not return acknowledgement-only filler such as "I understand", "Got it", or "Thanks for letting me know".\n- If the relationship is friend, sound warm, casual, and excited rather than formal.\n- Match the reply language to the latest incoming message and the dominant recent exchange. If the conversation is Spanish, write Spanish; preserve natural code-switching only when the conversation itself does it. The account language is a fallback, not an override.\n- Match the conversation's communication style: formality, sentence length, directness, energy, slang/idioms, punctuation, and emoji density. Sound natural for the owner without copying distinctive typos or overdoing slang.`;

      const userPrompt = guidance
        ? `${user}\n\nAdditional direction from the user: ${guidance}`
        : user;
      const rawContent = await this.callAI(systemWithJson, userPrompt);
      const response = this.parseAIResponse(rawContent, messageId, messageType);

      const safeResponse = await responseSafety.validateAndFilter(response, conversationContext);
      // Guided replies are intentionally one-off: do not let a personal instruction
      // become the default cache result for the same incoming message.
      if (!guidance) {
        await responseCache.setWithConfidenceTTL(cacheKey, userId, safeResponse);
      }
      this.trackResponseAnalytics(messageId, userId, safeResponse, conversationContext);

      return safeResponse;
    } catch (error) {
      logger.error('Error generating AI response:', error);
      throw error;
    }
  }

  /**
   * Explain the current conversation to the account owner. This is deliberately
   * separate from reply generation: it helps the user decide how to respond,
   * but it never sends or queues a message.
   */
  async explainConversation(
    messageId: string,
    content: string,
    userId: string,
    chatType: 'individual' | 'group'
  ): Promise<ConversationExplanation> {
    const context = await contextBuilder.buildContext(messageId, userId, 100);
    const relationship = context.contact?.relationship
      || context.contact?.inferredRelationship
      || context.chatCategory
      || 'not yet specified';
    const system = `You are Claire, a thoughtful private messaging assistant. Explain the latest message in context for the account owner. Do not invent facts or intentions. Return valid JSON only with exactly these keys: summary, latestMessageIntent, responseStrategy, suggestedNextStep, contextSignals. contextSignals must be an array of 2-4 concise facts grounded in the conversation. This is a ${chatType} chat. The relationship is ${relationship}.`;
    const user = `Latest message: "${content}"\n\nConversation context:\n${contextBuilder.formatForPrompt(context)}\n\nExplain what the latest message likely means, what matters in the context, and how the owner could respond.`;

    try {
      const raw = await this.callAI(system, user);
      const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()) as Record<string, unknown>;
      return {
        summary: typeof parsed.summary === 'string' ? parsed.summary : 'Claire could not summarize this conversation yet.',
        latestMessageIntent: typeof parsed.latestMessageIntent === 'string' ? parsed.latestMessageIntent : 'The latest message needs more context to interpret.',
        responseStrategy: typeof parsed.responseStrategy === 'string' ? parsed.responseStrategy : 'Reply directly and reference the latest plan or question.',
        suggestedNextStep: typeof parsed.suggestedNextStep === 'string' ? parsed.suggestedNextStep : 'Choose one of the reply options and adjust it to sound like you.',
        contextSignals: Array.isArray(parsed.contextSignals)
          ? parsed.contextSignals.filter((item): item is string => typeof item === 'string').slice(0, 4)
          : [],
      };
    } catch (error) {
      logger.error('Error explaining conversation:', error);
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
      const parsed = JSON.parse(clean) as Record<string, unknown>;
      // Accept common response-key aliases during a model/provider transition,
      // but always keep only usable sendable strings.
      const candidateSuggestions = parsed.suggestions ?? parsed.responses ?? parsed.replies ?? parsed.options;
      const suggestions = Array.isArray(candidateSuggestions)
        ? candidateSuggestions
          .filter((suggestion): suggestion is string => typeof suggestion === 'string')
          .map(suggestion => suggestion.trim())
          .filter(Boolean)
          .slice(0, 3)
        : [];
      return {
        messageId,
        suggestions: suggestions.length > 0 ? suggestions : ['I understand.', 'Thanks for letting me know.'],
        confidence: Math.min(Math.max(typeof parsed.confidence === 'number' ? parsed.confidence : 0.7, 0), 1),
        reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : undefined,
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

  /**
   * Summarize a block of text (e.g. a group-chat transcript).
   */
  async summarizeText(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.callAI(systemPrompt, userPrompt);
  }
}

export const aiProcessor = new AIProcessor();
