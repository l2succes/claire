import { aiProcessor } from '../../src/services/ai-processor';
import { contextBuilder } from '../../src/services/context-builder';
import { promptTemplates } from '../../src/services/prompt-templates';
import { responseCache } from '../../src/services/response-cache';
import { responseSafety } from '../../src/services/response-safety';

// Mock dependencies
jest.mock('../../src/services/context-builder');
jest.mock('../../src/services/prompt-templates');
jest.mock('../../src/services/response-cache');
jest.mock('../../src/services/response-safety');
jest.mock('../../src/services/supabase');
jest.mock('../../src/utils/logger');
jest.mock('openai');

describe('AIProcessor', () => {
  const mockContextBuilder = contextBuilder as jest.Mocked<typeof contextBuilder>;
  const mockPromptTemplates = promptTemplates as jest.Mocked<typeof promptTemplates>;
  const mockResponseCache = responseCache as jest.Mocked<typeof responseCache>;
  const mockResponseSafety = responseSafety as jest.Mocked<typeof responseSafety>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateResponse', () => {
    const mockConversationContext = {
      messages: [
        {
          id: 'msg1',
          content: 'How are you?',
          fromMe: false,
          timestamp: new Date(),
          type: 'text',
        },
      ],
      contact: {
        name: 'John Doe',
        relationship: 'friend',
      },
      userPreferences: {
        tone: 'friendly',
        responseStyle: 'concise',
        language: 'en',
      },
      metadata: {
        chatType: 'individual' as const,
        messageCount: 1,
      },
    };

    it('should generate response suggestions successfully', async () => {
      // Setup mocks
      mockResponseCache.get.mockResolvedValue(null);
      mockContextBuilder.buildContext.mockResolvedValue(mockConversationContext);
      mockPromptTemplates.detectMessageType.mockReturnValue('social');
      mockPromptTemplates.buildPrompt.mockReturnValue({
        system: 'You are a helpful assistant',
        user: 'Generate response for: Hello',
      });
      mockContextBuilder.formatForPrompt.mockReturnValue('Context string');
      mockResponseSafety.validateAndFilter.mockResolvedValue({
        messageId: 'test-msg-1',
        suggestions: ['Hi there!', 'Hello! How are you?'],
        confidence: 0.9,
        messageType: 'social',
      });
      mockResponseCache.set.mockResolvedValue();

      // Mock OpenAI response
      const mockOpenAI = require('openai');
      const mockCompletion = {
        choices: [{
          message: {
            content: JSON.stringify({
              suggestions: ['Hi there!', 'Hello! How are you?'],
              confidence: 0.9,
              reasoning: 'Friendly greeting response',
            }),
          },
        }],
      };
      mockOpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue(mockCompletion),
          },
        },
      }));

      const result = await aiProcessor.generateResponse(
        'test-msg-1',
        'Hello',
        'user-1',
        'individual'
      );

      expect(result).toEqual({
        messageId: 'test-msg-1',
        suggestions: ['Hi there!', 'Hello! How are you?'],
        confidence: 0.9,
        messageType: 'social',
      });

      expect(mockContextBuilder.buildContext).toHaveBeenCalledWith('test-msg-1', 'user-1');
      expect(mockPromptTemplates.detectMessageType).toHaveBeenCalledWith('Hello');
      expect(mockResponseSafety.validateAndFilter).toHaveBeenCalled();
    });

    it('should use cached response when available', async () => {
      const cachedResponse = {
        suggestions: ['Cached response'],
        confidence: 0.8,
        messageType: 'social',
        timestamp: Date.now(),
        ttl: 3600,
      };

      mockResponseCache.get.mockResolvedValue(cachedResponse);

      const result = await aiProcessor.generateResponse(
        'test-msg-1',
        'Hello',
        'user-1',
        'individual'
      );

      expect(result).toEqual({
        messageId: 'test-msg-1',
        suggestions: ['Cached response'],
        confidence: 0.8,
        messageType: 'social',
        cached: true,
      });

      // Should not call context builder or AI when using cache
      expect(mockContextBuilder.buildContext).not.toHaveBeenCalled();
    });

    it('should handle streaming responses', async () => {
      const streamingCallback = {
        onToken: jest.fn(),
        onComplete: jest.fn(),
        onError: jest.fn(),
      };

      mockResponseCache.get.mockResolvedValue(null);
      mockContextBuilder.buildContext.mockResolvedValue(mockConversationContext);
      mockPromptTemplates.detectMessageType.mockReturnValue('social');
      mockPromptTemplates.buildPrompt.mockReturnValue({
        system: 'You are a helpful assistant',
        user: 'Generate response for: Hello',
      });
      mockContextBuilder.formatForPrompt.mockReturnValue('Context string');

      // Mock streaming response
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield { choices: [{ delta: { content: '{"suggestions"' } }] };
          yield { choices: [{ delta: { content: ':["Hi there!"]}' } }] };
        },
      };

      const mockOpenAI = require('openai');
      mockOpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue(mockStream),
          },
        },
      }));

      mockResponseSafety.validateAndFilter.mockResolvedValue({
        messageId: 'test-msg-1',
        suggestions: ['Hi there!'],
        confidence: 0.8,
        messageType: 'social',
      });

      await aiProcessor.generateResponse(
        'test-msg-1',
        'Hello',
        'user-1',
        'individual',
        streamingCallback
      );

      expect(streamingCallback.onToken).toHaveBeenCalled();
      expect(streamingCallback.onComplete).toHaveBeenCalled();
    });
  });

  describe('updateFeedback', () => {
    it('should update suggestion feedback', async () => {
      const { supabase } = require('../../src/services/supabase');
      supabase.from.mockReturnValue({
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      });

      await aiProcessor.updateFeedback(
        'test-msg-1',
        'user-1',
        1,
        'positive',
        'Custom response'
      );

      expect(supabase.from).toHaveBeenCalledWith('ai_suggestions');
    });
  });

  describe('analyzeSentiment', () => {
    it('should analyze message sentiment', async () => {
      const mockOpenAI = require('openai');
      const mockCompletion = {
        choices: [{
          message: {
            content: 'positive',
          },
        }],
      };
      
      mockOpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue(mockCompletion),
          },
        },
      }));

      const sentiment = await aiProcessor.analyzeSentiment('I love this!');
      expect(sentiment).toBe('positive');
    });

    it('should return neutral on error', async () => {
      const mockOpenAI = require('openai');
      mockOpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: jest.fn().mockRejectedValue(new Error('API Error')),
          },
        },
      }));

      const sentiment = await aiProcessor.analyzeSentiment('Test message');
      expect(sentiment).toBe('neutral');
    });
  });

  describe('extractTopics', () => {
    it('should extract topics from message', async () => {
      const mockOpenAI = require('openai');
      const mockCompletion = {
        choices: [{
          message: {
            content: JSON.stringify({ topics: ['work', 'project', 'deadline'] }),
          },
        }],
      };
      
      mockOpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue(mockCompletion),
          },
        },
      }));

      const topics = await aiProcessor.extractTopics('We need to finish the work project by the deadline');
      expect(topics).toEqual(['work', 'project', 'deadline']);
    });

    it('should return empty array on error', async () => {
      const mockOpenAI = require('openai');
      mockOpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: jest.fn().mockRejectedValue(new Error('API Error')),
          },
        },
      }));

      const topics = await aiProcessor.extractTopics('Test message');
      expect(topics).toEqual([]);
    });
  });
});