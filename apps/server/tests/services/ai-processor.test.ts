/**
 * Unit tests for AIProcessor.
 *
 * Rewritten for the current implementation (issue #23 / provider refactor):
 * the processor no longer talks to a hard-coded `openai` client — it funnels
 * every model call through the private `callAI()` method (Bedrock/Kimi with
 * fallback). These tests stub `callAI` and mock the collaborating singletons
 * via bun:test `mock.module`, so no real infrastructure or network is touched.
 */

import { describe, it, expect, beforeEach, mock, spyOn } from 'bun:test';
import { aiConfig } from '../../src/config';

// ──────────────────────────────────────────────────────────────────────────────
// Mock collaborating singletons before importing the module under test.
// ──────────────────────────────────────────────────────────────────────────────
const conversationContext = {
  messages: [
    { id: 'msg1', content: 'How are you?', fromMe: false, timestamp: new Date(), type: 'text' },
  ],
  contact: { name: 'John Doe', relationship: 'friend' },
  userPreferences: { tone: 'friendly', responseStyle: 'concise', language: 'en' },
  metadata: { chatType: 'individual' as const, messageCount: 1 },
};

const contextBuilderMock = {
  buildContext: mock(async (..._a: unknown[]) => conversationContext as any),
  formatForPrompt: mock((..._a: unknown[]) => 'Context string'),
};
const promptTemplatesMock = {
  detectMessageType: mock((..._a: unknown[]) => 'social'),
  buildPrompt: mock((..._a: unknown[]) => ({ system: 'You are a helpful assistant', user: 'Generate a reply' })),
};
const responseCacheMock = {
  get: mock(async (..._a: unknown[]) => null as any),
  setWithConfidenceTTL: mock(async (..._a: unknown[]) => {}),
};
const responseSafetyMock = {
  // Pass-through by default: return whatever the processor produced.
  validateAndFilter: mock(async (resp: any, _ctx: unknown) => resp),
};
const voiceProfileMock = { guidanceFor: mock(async () => 'Owner voice guidance') };
const supabaseMock = {
  from: mock((_table: string) => ({
    update: mock(() => ({
      eq: mock(() => ({ eq: mock(async () => ({ data: null, error: null })) })),
    })),
    upsert: mock(async () => ({ data: null, error: null })),
  })),
};

mock.module('../../src/services/context-builder', () => ({ contextBuilder: contextBuilderMock }));
mock.module('../../src/services/prompt-templates', () => ({ promptTemplates: promptTemplatesMock }));
mock.module('../../src/services/response-cache', () => ({ responseCache: responseCacheMock }));
mock.module('../../src/services/response-safety', () => ({ responseSafety: responseSafetyMock }));
mock.module('../../src/services/voice-profile-service', () => ({ voiceProfileService: voiceProfileMock }));
mock.module('../../src/services/supabase', () => ({ supabase: supabaseMock }));
mock.module('../../src/utils/logger', () => ({
  logger: { info: mock(() => {}), warn: mock(() => {}), error: mock(() => {}), debug: mock(() => {}) },
  stream: { write: mock(() => {}) },
}));

// Import after mocking.
import { AIProcessor, aiProcessor } from '../../src/services/ai-processor';

type AnyMock = ReturnType<typeof mock>;

// Stub the private provider call so no real model is invoked.
const callAI = spyOn(aiProcessor as any, 'callAI');

function resetMocks() {
  for (const obj of [contextBuilderMock, promptTemplatesMock, responseCacheMock, responseSafetyMock, voiceProfileMock, supabaseMock]) {
    for (const m of Object.values(obj)) (m as AnyMock).mockClear();
  }
  contextBuilderMock.buildContext.mockResolvedValue(conversationContext as any);
  contextBuilderMock.formatForPrompt.mockReturnValue('Context string');
  promptTemplatesMock.detectMessageType.mockReturnValue('social');
  promptTemplatesMock.buildPrompt.mockReturnValue({ system: 'You are a helpful assistant', user: 'Generate a reply' });
  responseCacheMock.get.mockResolvedValue(null);
  responseSafetyMock.validateAndFilter.mockImplementation(async (resp: any) => resp);
  voiceProfileMock.guidanceFor.mockResolvedValue('Owner voice guidance');
  callAI.mockReset();
}

beforeEach(resetMocks);

describe('AIProcessor', () => {
  describe('provider routing', () => {
    it('uses OpenAI when OpenAI is the configured provider', async () => {
      const configForTest = aiConfig as { provider: 'bedrock' | 'kimi' | 'openai' };
      const originalProvider = configForTest.provider;
      const processor = new AIProcessor();
      const create = mock(async () => ({ choices: [{ message: { content: '{"suggestions":["Sounds good"],"confidence":0.9}' } }] }));

      try {
        configForTest.provider = 'openai';
        (processor as any).bedrock = null;
        (processor as any).kimiClient = null;
        (processor as any).openaiClient = { chat: { completions: { create } } };

        const result = await (processor as any).callAI('system prompt', 'user prompt');

        expect(result).toContain('Sounds good');
        expect(create).toHaveBeenCalledTimes(1);
      } finally {
        configForTest.provider = originalProvider;
      }
    });
  });

  describe('generateResponse', () => {
    it('generates response suggestions on a cache miss', async () => {
      callAI.mockResolvedValue(
        JSON.stringify({
          suggestions: ['Hi there!', 'Hello! How are you?'],
          confidence: 0.9,
          reasoning: 'Friendly greeting response',
        })
      );

      const result = await aiProcessor.generateResponse('test-msg-1', 'Hello', 'user-1', 'individual');

      expect(result.messageId).toBe('test-msg-1');
      expect(result.suggestions).toEqual(['Hi there!', 'Hello! How are you?']);
      expect(result.confidence).toBe(0.9);
      expect(result.messageType).toBe('social');

      expect(contextBuilderMock.buildContext).toHaveBeenCalledWith('test-msg-1', 'user-1');
      expect(promptTemplatesMock.detectMessageType).toHaveBeenCalledWith('Hello');
      expect(responseSafetyMock.validateAndFilter).toHaveBeenCalled();
      expect(responseCacheMock.setWithConfidenceTTL).toHaveBeenCalled();
      expect(responseCacheMock.get).toHaveBeenCalledWith('voice-rules-v1:test-msg-1:Hello', 'user-1');

      // The processor appends a JSON-only instruction to the system prompt.
      const [systemArg] = callAI.mock.calls[0] as [string, string];
      expect(systemArg).toContain('valid JSON only');
      expect(systemArg).toContain('Do not return acknowledgement-only filler');
      expect(systemArg).toContain('Match the reply language to the latest incoming message');
      expect(systemArg).toContain('Match the conversation\'s communication style');
      expect(systemArg).toContain('Keep each default suggestion short');
      expect(systemArg).toContain('Do not invent pet names');
      expect(voiceProfileMock.guidanceFor).toHaveBeenCalled();
      const [, userArg] = callAI.mock.calls[0] as [string, string];
      expect(userArg).toContain('Instruction precedence: safety and output rules first');
      expect(userArg).toContain('saved conversation instruction; then the learned owner voice');
      expect(promptTemplatesMock.buildPrompt).toHaveBeenCalledWith(
        'Hello',
        'social',
        expect.objectContaining({
          relationship: 'friend',
          language: expect.stringContaining('dominant language in the latest message'),
        }),
        expect.stringContaining('Owner voice guidance'),
        3
      );
    });

    it('returns the cached response without calling the model', async () => {
      responseCacheMock.get.mockResolvedValue({
        suggestions: ['Cached response'],
        confidence: 0.8,
        messageType: 'social',
      });

      const result = await aiProcessor.generateResponse('test-msg-1', 'Hello', 'user-1', 'individual');

      expect(result).toEqual(
        expect.objectContaining({
          messageId: 'test-msg-1',
          suggestions: ['Cached response'],
          confidence: 0.8,
          cached: true,
        })
      );
      expect(contextBuilderMock.buildContext).not.toHaveBeenCalled();
      expect(callAI).not.toHaveBeenCalled();
    });

    it('bypasses the cache and passes user guidance to a regenerated response', async () => {
      responseCacheMock.get.mockResolvedValue({
        suggestions: ['Cached response'],
        confidence: 0.8,
        messageType: 'social',
      });
      callAI.mockResolvedValue(JSON.stringify({ suggestions: ['Playful reply'], confidence: 0.9 }));

      await aiProcessor.generateResponse('test-msg-1', 'Hello', 'user-1', 'individual', {
        guidance: 'Keep it playful',
        forceRefresh: true,
      });

      expect(responseCacheMock.get).not.toHaveBeenCalled();
      const [, userPrompt] = callAI.mock.calls[0] as [string, string];
      expect(userPrompt).toContain('Instruction precedence: safety and output rules first');
      expect(userPrompt).toContain('Additional direction from the user: Keep it playful');
      expect(responseCacheMock.setWithConfidenceTTL).not.toHaveBeenCalled();
    });

    it('falls back to safe defaults when the model returns invalid JSON', async () => {
      callAI.mockResolvedValue('not json at all');

      const result = await aiProcessor.generateResponse('test-msg-1', 'Hello', 'user-1', 'individual');

      expect(Array.isArray(result.suggestions)).toBe(true);
      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('explains the latest message using the conversation context without sending a reply', async () => {
      callAI.mockResolvedValue(JSON.stringify({
        summary: 'They want to make plans before Friday.',
        latestMessageIntent: 'They are checking whether you can meet before they leave.',
        responseStrategy: 'Confirm interest and suggest a specific time tomorrow.',
        suggestedNextStep: 'Offer a time and place.',
        contextSignals: ['They mentioned leaving Friday', 'The chat is casual'],
      }));

      const result = await aiProcessor.explainConversation('test-msg-1', 'I leave Friday', 'user-1', 'individual');

      expect(contextBuilderMock.buildContext).toHaveBeenCalledWith('test-msg-1', 'user-1', 100);
      expect(result.suggestedNextStep).toBe('Offer a time and place.');
      expect(result.contextSignals).toEqual(['They mentioned leaving Friday', 'The chat is casual']);
    });
  });

  describe('updateFeedback', () => {
    it('writes feedback to the ai_suggestions table', async () => {
      await aiProcessor.updateFeedback('test-msg-1', 'user-1', 1, 'positive', 'Custom response');
      expect(supabaseMock.from).toHaveBeenCalledWith('ai_suggestions');
    });
  });

  describe('analyzeSentiment', () => {
    it('returns the classified sentiment', async () => {
      callAI.mockResolvedValue('positive');
      expect(await aiProcessor.analyzeSentiment('I love this!')).toBe('positive');
    });

    it('returns neutral on error', async () => {
      callAI.mockRejectedValue(new Error('API Error'));
      expect(await aiProcessor.analyzeSentiment('Test message')).toBe('neutral');
    });
  });

  describe('extractTopics', () => {
    it('extracts topics from the message', async () => {
      callAI.mockResolvedValue(JSON.stringify({ topics: ['work', 'project', 'deadline'] }));
      const topics = await aiProcessor.extractTopics('Finish the work project by the deadline');
      expect(topics).toEqual(['work', 'project', 'deadline']);
    });

    it('returns an empty array on error', async () => {
      callAI.mockRejectedValue(new Error('API Error'));
      expect(await aiProcessor.extractTopics('Test message')).toEqual([]);
    });
  });
});
