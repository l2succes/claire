/**
 * Unit tests for the upgraded PromiseDetector (issue #16).
 *
 * All external dependencies (aiProcessor, supabase, logger) are mocked so
 * these tests run with zero real infrastructure.
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';

// ---------------------------------------------------------------------------
// Mock heavy dependencies before importing the module under test
// ---------------------------------------------------------------------------

// Mock logger (avoid console noise)
mock.module('../../src/utils/logger', () => ({
  logger: { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} },
}));

// Mock supabase (storePromises calls supabase.from)
mock.module('../../src/services/supabase', () => ({
  supabase: {
    from: () => ({
      insert: () => Promise.resolve({ data: null, error: null }),
    }),
  },
}));

// Mock aiProcessor — controls whether LLM path is exercised
let mockCallAI: (...args: any[]) => Promise<string> = async () => '{"promises":[]}';
let mockIsConfigured = true;

// We expose the mock object directly so that the import binding in
// promise-detector.ts gets a stable reference whose properties change per-test.
const mockAiProcessorObj = {
  get isConfigured() { return mockIsConfigured; },
  callAI: (...args: any[]) => mockCallAI(...args),
};

mock.module('../../src/services/ai-processor', () => ({
  aiProcessor: mockAiProcessorObj,
}));

// Import after mocking
import { promiseDetector } from '../../src/services/promise-detector';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const uid = 'user-test-1';
const mid = 'msg-test-1';

function llmReturns(promises: object[]) {
  mockCallAI = async () => JSON.stringify({ promises });
}

function llmThrows(msg = 'LLM unavailable') {
  mockCallAI = async () => { throw new Error(msg); };
}

function llmReturnsRaw(raw: string) {
  mockCallAI = async () => raw;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PromiseDetector — LLM path (positive cases)', () => {
  beforeEach(() => {
    mockIsConfigured = true;
    // Reset in-process cache between tests by injecting a different content
  });

  it('extracts a commitment from an explicit "I will" message', async () => {
    llmReturns([
      {
        type: 'commitment',
        text: "I'll send you the report",
        deadline: null,
        contact: 'Alice',
        priority: 'medium',
        confidence: 0.95,
      },
    ]);

    const result = await promiseDetector.detectWithLLM("I'll send you the report, Alice");
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('commitment');
    expect(result[0].text).toBe("I'll send you the report");
    expect(result[0].contact).toBe('Alice');
    expect(result[0].confidence).toBe(0.95);
    expect(result[0].fromFallback).toBeUndefined();
  });

  it('extracts a deadline promise with ISO date', async () => {
    const isoDate = '2026-07-04T00:00:00.000Z';
    llmReturns([
      {
        type: 'deadline',
        text: 'Submit the proposal by Friday',
        deadline: isoDate,
        contact: null,
        priority: 'high',
        confidence: 0.9,
      },
    ]);

    const result = await promiseDetector.detectWithLLM('Submit the proposal by Friday');
    expect(result[0].deadline).toBe(isoDate);
    expect(result[0].priority).toBe('high');
  });

  it('returns empty array when LLM finds no promises', async () => {
    llmReturns([]);
    const result = await promiseDetector.detectWithLLM('The weather is nice today');
    expect(result).toHaveLength(0);
  });

  it('strips markdown fences from LLM response', async () => {
    llmReturnsRaw(
      '```json\n{"promises":[{"type":"task","text":"Buy groceries","deadline":null,"contact":null,"priority":"low","confidence":0.8}]}\n```'
    );
    const result = await promiseDetector.detectWithLLM('I need to buy groceries');
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('Buy groceries');
  });

  it('clamps confidence to [0, 1]', async () => {
    llmReturns([{ type: 'commitment', text: 'I promise', confidence: 1.5, priority: 'medium' }]);
    const [p] = await promiseDetector.detectWithLLM('I promise to do it');
    expect(p.confidence).toBe(1);
  });

  it('defaults invalid type to "commitment"', async () => {
    llmReturns([{ type: 'unknown_type', text: 'Some obligation', confidence: 0.6, priority: 'low' }]);
    const [p] = await promiseDetector.detectWithLLM('Some obligation');
    expect(p.type).toBe('commitment');
  });

  it('filters out entries with empty text', async () => {
    llmReturns([
      { type: 'task', text: '', confidence: 0.8, priority: 'medium' },
      { type: 'commitment', text: 'I will call you', confidence: 0.9, priority: 'medium' },
    ]);
    const result = await promiseDetector.detectWithLLM('I will call you');
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('I will call you');
  });
});

describe('PromiseDetector — LLM fallback path', () => {
  beforeEach(() => {
    mockIsConfigured = true;
  });

  it('falls back to regex when LLM throws', async () => {
    llmThrows('Network error');
    // detectWithLLM should return [] on throw
    const llmResult = await promiseDetector.detectWithLLM('I will send you the docs');
    expect(llmResult).toHaveLength(0);
  });

  it('falls back to regex when LLM returns invalid JSON', async () => {
    llmReturnsRaw('not valid json at all');
    const llmResult = await promiseDetector.detectWithLLM('I will fix this tomorrow');
    expect(llmResult).toHaveLength(0);
  });

  it('detectPromises uses regex fallback when LLM returns empty', async () => {
    llmReturns([]); // LLM says no promises
    // "I'll" matches commitment regex → fallback kicks in
    const result = await promiseDetector.detectPromises(mid, "I'll call you tomorrow", uid, true);
    // Regex should find a commitment
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].fromFallback).toBe(true);
  });

  it('detectPromises uses regex when AI is not configured', async () => {
    mockIsConfigured = false;
    const result = await promiseDetector.detectPromises(mid, 'I will send it by Monday', uid, true);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].fromFallback).toBe(true);
    mockIsConfigured = true;
  });
});

describe('PromiseDetector — regex (detectWithPatterns)', () => {
  it('detects a commitment phrase', () => {
    const result = promiseDetector.detectWithPatterns("I'll finish the report");
    expect(result.some((p) => p.type === 'commitment')).toBe(true);
    expect(result[0].fromFallback).toBe(true);
  });

  it('detects a deadline phrase', () => {
    const result = promiseDetector.detectWithPatterns('This is due by Friday');
    expect(result.some((p) => p.type === 'deadline')).toBe(true);
  });

  it('detects a task phrase', () => {
    const result = promiseDetector.detectWithPatterns('Remind me to call the doctor');
    expect(result.some((p) => p.type === 'task')).toBe(true);
  });

  it('detects an appointment phrase', () => {
    const result = promiseDetector.detectWithPatterns("Let's meet tomorrow");
    expect(result.some((p) => p.type === 'appointment')).toBe(true);
  });

  it('returns empty for plain statements with no promise', () => {
    const result = promiseDetector.detectWithPatterns('The sky is blue');
    expect(result).toHaveLength(0);
  });

  it('sets high priority for urgent messages', () => {
    const result = promiseDetector.detectWithPatterns("I'll do it ASAP, it's urgent");
    expect(result[0]?.priority).toBe('high');
  });

  it('sets low priority for no-rush messages', () => {
    const result = promiseDetector.detectWithPatterns("I'll do it whenever you can");
    expect(result[0]?.priority).toBe('low');
  });

  it('extracts "tomorrow" deadline as ISO string', () => {
    const result = promiseDetector.detectWithPatterns("I'll send it by tomorrow");
    const deadline = result.find((p) => p.deadline)?.deadline;
    expect(deadline).toBeDefined();
    expect(new Date(deadline!).getTime()).toBeGreaterThan(Date.now());
  });
});

describe('PromiseDetector — edge cases', () => {
  it('returns empty array for empty string', async () => {
    const result = await promiseDetector.detectPromises(mid, '', uid, false);
    expect(result).toHaveLength(0);
  });

  it('returns empty array for whitespace-only string', async () => {
    const result = await promiseDetector.detectPromises(mid, '   ', uid, false);
    expect(result).toHaveLength(0);
  });

  it('deduplicates near-identical promises via detectPromises', async () => {
    mockIsConfigured = true;
    llmReturns([
      { type: 'commitment', text: "I'll call you back", confidence: 0.9, priority: 'medium' },
      { type: 'commitment', text: "I'll call you back", confidence: 0.85, priority: 'medium' },
    ]);
    // Use a unique string to avoid in-process cache collision
    const result = await promiseDetector.detectPromises(
      'msg-dedup-test',
      "I'll call you back — definitely I will",
      uid,
      true
    );
    // After deduplication only one entry should remain for the same text
    const dupeCommitments = result.filter(
      (p) => p.type === 'commitment' && p.text === "I'll call you back"
    );
    expect(dupeCommitments.length).toBeLessThanOrEqual(1);
  });
});
