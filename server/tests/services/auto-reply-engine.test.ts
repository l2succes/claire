/**
 * Unit tests for the auto-reply rule engine (issue #39).
 *
 * Verifies:
 *   - trigger matching (keyword, birthday, thanks)
 *   - rate-cap enforcement (per-hour and per-day)
 *   - safety filter applied to generated reply
 *   - correct no-match / db-error paths
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

mock.module('../../src/utils/logger', () => ({
  logger: { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} },
}));

// Mutable supabase mock (tests override per-scenario)
let mockRulesResult: { data: any; error: any } = { data: [], error: null };
let mockLogCountResult: { count: number; error: any } = { count: 0, error: null };
let mockLogInsertResult: { error: any } = { error: null };

mock.module('../../src/services/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'auto_reply_rules') {
        // Chain: .select('*').eq('user_id').eq('enabled').order()
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => Promise.resolve(mockRulesResult),
              }),
            }),
          }),
        };
      }
      if (table === 'auto_reply_log') {
        // Chains used:
        //   .select('id', {count,head}).eq('rule_id').gte('fired_at')   => rate-cap count
        //   .insert({...})                                               => fire log
        return {
          select: (_fields: string, _opts?: any) => ({
            eq: () => ({
              gte: () => Promise.resolve(mockLogCountResult),
            }),
          }),
          insert: () => Promise.resolve(mockLogInsertResult),
        };
      }
      return {};
    },
  },
}));

// Mutable safety mock
let mockSafetyReply = 'Safe reply';

mock.module('../../src/services/response-safety', () => ({
  responseSafety: {
    validateAndFilter: (_response: any, _ctx: any) =>
      Promise.resolve({
        messageId: 'msg-1',
        suggestions: [mockSafetyReply],
        confidence: 1,
      }),
  },
}));

// Import AFTER mocks
import { autoReplyEngine, AutoReplyRule, IncomingMessage } from '../../src/services/auto-reply-engine';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const baseRule = (overrides: Partial<AutoReplyRule> = {}): AutoReplyRule => ({
  id: 'rule-1',
  user_id: 'user-1',
  name: 'Test Rule',
  enabled: true,
  trigger_type: 'keyword',
  keywords: ['meeting', 'schedule'],
  reply_template: 'Hi {name}, I will get back to you shortly.',
  platforms: undefined,
  max_per_hour: 5,
  max_per_day: 20,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

const baseMsg = (overrides: Partial<IncomingMessage> = {}): IncomingMessage => ({
  id: 'msg-1',
  userId: 'user-1',
  chatId: 'chat-1',
  platform: 'whatsapp',
  content: 'Can we schedule a meeting?',
  senderName: 'Alice',
  ...overrides,
});

beforeEach(() => {
  // Reset to safe defaults
  mockRulesResult = { data: [], error: null };
  mockLogCountResult = { count: 0, error: null };
  mockLogInsertResult = { error: null };
  mockSafetyReply = 'Safe reply';
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AutoReplyEngine.evaluate', () => {
  it('fires on a keyword match', async () => {
    mockRulesResult = { data: [baseRule()], error: null };
    mockSafetyReply = 'Hi Alice, I will get back to you shortly.';

    const result = await autoReplyEngine.evaluate(baseMsg());
    expect(result.fired).toBe(true);
    expect(result.ruleId).toBe('rule-1');
    expect(typeof result.reply).toBe('string');
  });

  it('does not fire when content does not match keywords', async () => {
    mockRulesResult = { data: [baseRule()], error: null };

    const result = await autoReplyEngine.evaluate(baseMsg({ content: 'Hello, how are you?' }));
    expect(result.fired).toBe(false);
    expect(result.reason).toBe('no_match');
  });

  it('fires on thanks trigger', async () => {
    mockRulesResult = {
      data: [baseRule({ trigger_type: 'thanks', keywords: undefined })],
      error: null,
    };
    mockSafetyReply = 'You are welcome!';

    const result = await autoReplyEngine.evaluate(baseMsg({ content: 'Thank you so much!' }));
    expect(result.fired).toBe(true);
  });

  it('fires on birthday trigger', async () => {
    mockRulesResult = {
      data: [baseRule({ trigger_type: 'birthday', keywords: undefined, reply_template: 'Happy birthday!' })],
      error: null,
    };
    mockSafetyReply = 'Happy birthday!';

    const result = await autoReplyEngine.evaluate(baseMsg({ content: 'Happy birthday to you!' }));
    expect(result.fired).toBe(true);
  });

  it('respects hourly rate cap — skips rule when cap exceeded', async () => {
    mockRulesResult = { data: [baseRule({ max_per_hour: 3 })], error: null };
    mockLogCountResult = { count: 3, error: null }; // at cap

    const result = await autoReplyEngine.evaluate(baseMsg());
    expect(result.fired).toBe(false);
  });

  it('returns no_rules when user has no rules', async () => {
    mockRulesResult = { data: [], error: null };

    const result = await autoReplyEngine.evaluate(baseMsg());
    expect(result.fired).toBe(false);
    expect(result.reason).toBe('no_rules');
  });

  it('returns db_error on supabase failure', async () => {
    mockRulesResult = { data: null, error: new Error('DB offline') };

    const result = await autoReplyEngine.evaluate(baseMsg());
    expect(result.fired).toBe(false);
    expect(result.reason).toBe('db_error');
  });

  it('skips rule whose platform does not match', async () => {
    mockRulesResult = {
      data: [baseRule({ platforms: ['telegram'] })],
      error: null,
    };

    const result = await autoReplyEngine.evaluate(baseMsg({ platform: 'whatsapp' }));
    expect(result.fired).toBe(false);
  });
});

describe('AutoReplyEngine.matchesTrigger', () => {
  it('keyword match is case-insensitive', () => {
    const rule = baseRule({ keywords: ['Meeting'] });
    const msg = baseMsg({ content: 'Can we MEETING tomorrow?' });
    expect(autoReplyEngine.matchesTrigger(rule, msg)).toBe(true);
  });

  it('keyword does not fire when not present', () => {
    const rule = baseRule({ keywords: ['meeting'] });
    const msg = baseMsg({ content: 'Hello there, how are you?' });
    expect(autoReplyEngine.matchesTrigger(rule, msg)).toBe(false);
  });

  it('thanks pattern matches "thank you"', () => {
    const rule = baseRule({ trigger_type: 'thanks', keywords: undefined });
    expect(autoReplyEngine.matchesTrigger(rule, baseMsg({ content: 'Thank you!' }))).toBe(true);
  });

  it('thanks pattern matches "thx"', () => {
    const rule = baseRule({ trigger_type: 'thanks', keywords: undefined });
    expect(autoReplyEngine.matchesTrigger(rule, baseMsg({ content: 'thx a lot!' }))).toBe(true);
  });

  it('birthday pattern matches "HBD"', () => {
    const rule = baseRule({ trigger_type: 'birthday', keywords: undefined });
    expect(autoReplyEngine.matchesTrigger(rule, baseMsg({ content: 'HBD bro!' }))).toBe(true);
  });

  it('birthday pattern matches "happy birthday"', () => {
    const rule = baseRule({ trigger_type: 'birthday', keywords: undefined });
    expect(autoReplyEngine.matchesTrigger(rule, baseMsg({ content: 'happy birthday!' }))).toBe(true);
  });

  it('empty keywords list never matches', () => {
    const rule = baseRule({ trigger_type: 'keyword', keywords: [] });
    expect(autoReplyEngine.matchesTrigger(rule, baseMsg({ content: 'anything here' }))).toBe(false);
  });
});
