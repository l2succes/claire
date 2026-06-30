/**
 * Unit tests for MemoryService (issue #31).
 *
 * Verifies:
 * - getContactMemory fetches, parses, and defaults correctly
 * - upsertMemory honours confidence guard
 * - formatForPrompt produces the expected snippet
 * - contextBuilder.formatForPrompt injects memory into the prompt string
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';

// ---------------------------------------------------------------------------
// Mocks (must be set up before importing the modules under test)
// ---------------------------------------------------------------------------

mock.module('../../src/utils/logger', () => ({
  logger: { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} },
}));

// Supabase mock — we swap the from() implementation per-test via `supabaseFromImpl`
let supabaseFromImpl: (table: string) => any = () => ({});

mock.module('../../src/services/supabase', () => ({
  supabase: {
    get from() {
      return (table: string) => supabaseFromImpl(table);
    },
  },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { MemoryService } from '../../src/services/memory-service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Chainable stub that resolves at .order() with the given payload. */
function makeQueryChain(resolvedValue: { data: any; error: any }) {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    order: () => Promise.resolve(resolvedValue),
    single: () => Promise.resolve(resolvedValue),
  };
  return chain;
}

// ---------------------------------------------------------------------------
// MemoryService unit tests
// ---------------------------------------------------------------------------

describe('MemoryService', () => {
  let service: MemoryService;

  beforeEach(() => {
    service = new MemoryService();
    // Reset to a safe default
    supabaseFromImpl = () => makeQueryChain({ data: [], error: null });
  });

  describe('getContactMemory', () => {
    it('returns parsed memory entries on success', async () => {
      supabaseFromImpl = () =>
        makeQueryChain({
          data: [
            { key: 'birthday', value: 'March 14', confidence: 0.9 },
            { key: 'job', value: 'Software Engineer', confidence: 1.0 },
          ],
          error: null,
        });

      const result = await service.getContactMemory('user-1', 'contact-1');
      expect(result).toEqual([
        { key: 'birthday', value: 'March 14', confidence: 0.9 },
        { key: 'job', value: 'Software Engineer', confidence: 1.0 },
      ]);
    });

    it('returns empty array on DB error', async () => {
      supabaseFromImpl = () =>
        makeQueryChain({ data: null, error: { message: 'DB error' } });

      const result = await service.getContactMemory('user-1', 'contact-1');
      expect(result).toEqual([]);
    });

    it('defaults confidence to 1.0 when null in DB', async () => {
      supabaseFromImpl = () =>
        makeQueryChain({
          data: [{ key: 'hobby', value: 'cycling', confidence: null }],
          error: null,
        });

      const result = await service.getContactMemory('user-1', 'contact-1');
      expect(result[0].confidence).toBe(1.0);
    });
  });

  describe('upsertMemory', () => {
    it('calls supabase.upsert with correct payload for a new entry', async () => {
      let capturedPayload: any = null;

      supabaseFromImpl = () => {
        const stub: any = {
          select: () => stub,
          eq: () => stub,
          single: () => Promise.resolve({ data: null, error: null }),
          upsert: (payload: any, _opts: any) => {
            capturedPayload = payload;
            return Promise.resolve({ error: null });
          },
        };
        return stub;
      };

      await service.upsertMemory('user-1', 'contact-1', 'birthday', 'March 14', 0.9);

      expect(capturedPayload).toMatchObject({
        user_id: 'user-1',
        contact_id: 'contact-1',
        key: 'birthday',
        value: 'March 14',
        confidence: 0.9,
      });
    });

    it('skips upsert when existing confidence is higher', async () => {
      let upsertCalled = false;

      supabaseFromImpl = () => {
        const stub: any = {
          select: () => stub,
          eq: () => stub,
          single: () => Promise.resolve({ data: { confidence: 0.95 }, error: null }),
          upsert: () => { upsertCalled = true; return Promise.resolve({ error: null }); },
        };
        return stub;
      };

      await service.upsertMemory('user-1', 'contact-1', 'birthday', 'March 14', 0.5);
      expect(upsertCalled).toBe(false);
    });
  });

  describe('formatForPrompt', () => {
    it('returns empty string for no entries', () => {
      expect(service.formatForPrompt([])).toBe('');
    });

    it('formats entries as a prompt snippet', () => {
      const entries = [
        { key: 'birthday', value: 'March 14', confidence: 0.9 },
        { key: 'job', value: 'Engineer', confidence: 1.0 },
      ];
      const result = service.formatForPrompt(entries);
      expect(result).toContain('What I remember about this person:');
      expect(result).toContain('- birthday: March 14');
      expect(result).toContain('- job: Engineer');
    });
  });
});

// ---------------------------------------------------------------------------
// ContextBuilder: memory injection into formatted prompt
// ---------------------------------------------------------------------------

describe('ContextBuilder.formatForPrompt memory injection', () => {
  it('injects memory snippet into the formatted prompt', async () => {
    // Provide a memory service that returns a known snippet
    mock.module('../../src/services/memory-service', () => ({
      memoryService: {
        getContactMemory: async () => [],
        formatForPrompt: (entries: any[]) => {
          if (entries.length === 0) return '';
          return `What I remember about this person:\n${entries.map((e: any) => `- ${e.key}: ${e.value}`).join('\n')}\n`;
        },
      },
      MemoryEntry: {},
    }));

    // Import contextBuilder *after* re-registering the mock so the module
    // resolver picks up the stub implementation.
    const { contextBuilder } = await import('../../src/services/context-builder');

    const ctx: any = {
      messages: [],
      contact: null,
      userPreferences: null,
      metadata: { chatType: 'individual', messageCount: 0 },
      contactMemory: [{ key: 'birthday', value: 'March 14', confidence: 0.9 }],
    };

    const prompt = contextBuilder.formatForPrompt(ctx);
    expect(prompt).toContain('What I remember about this person:');
    expect(prompt).toContain('- birthday: March 14');
  });

  it('omits memory section when contactMemory is empty', async () => {
    const { contextBuilder } = await import('../../src/services/context-builder');

    const ctx: any = {
      messages: [],
      contact: null,
      userPreferences: null,
      metadata: { chatType: 'individual', messageCount: 0 },
      contactMemory: [],
    };

    const prompt = contextBuilder.formatForPrompt(ctx);
    expect(prompt).not.toContain('What I remember about this person:');
  });
});
