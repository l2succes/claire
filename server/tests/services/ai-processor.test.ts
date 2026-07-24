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
mock.module('../../src/services/supabase', () => ({ supabase: supabaseMock }));
mock.module('../../src/utils/logger', () => ({
  logger: { info: mock(() => {}), warn: mock(() => {}), error: mock(() => {}), debug: mock(() => {}) },
  stream: { write: mock(() => {}) },
}));

// Import after mocking.
import { aiProcessor } from '../../src/services/ai-processor';

type AnyMock = ReturnType<typeof mock>;

// Stub the private provider call so no real model is invoked.
const callAI = spyOn(aiProcessor as any, 'callAI');

function resetMocks() {
  for (const obj of [contextBuilderMock, promptTemplatesMock, responseCacheMock, responseSafetyMock, supabaseMock]) {
    for (const m of Object.values(obj)) (m as AnyMock).mockClear();
  }
  contextBuilderMock.buildContext.mockResolvedValue(conversationContext as any);
  contextBuilderMock.formatForPrompt.mockReturnValue('Context string');
  promptTemplatesMock.detectMessageType.mockReturnValue('social');
  promptTemplatesMock.buildPrompt.mockReturnValue({ system: 'You are a helpful assistant', user: 'Generate a reply' });
  responseCacheMock.get.mockResolvedValue(null);
  responseSafetyMock.validateAndFilter.mockImplementation(async (resp: any) => resp);
  callAI.mockReset();
}

beforeEach(resetMocks);

describe('AIProcessor', () => {
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

      // The processor appends a JSON-only instruction to the system prompt.
      const [systemArg] = callAI.mock.calls[0] as [string, string];
      expect(systemArg).toContain('valid JSON only');
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

    it('falls back to safe defaults when the model returns invalid JSON', async () => {
      callAI.mockResolvedValue('not json at all');

      const result = await aiProcessor.generateResponse('test-msg-1', 'Hello', 'user-1', 'individual');

      expect(Array.isArray(result.suggestions)).toBe(true);
      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
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
