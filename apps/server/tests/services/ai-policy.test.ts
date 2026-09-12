/**
 * Per-chat AI scope.
 *
 * The whole feature reduces to one expression, so it is worth pinning all four
 * input shapes explicitly: getting this wrong either processes groups the user
 * never opted into, or silently stops processing their 1:1s.
 */

import { describe, it, expect } from 'bun:test';
import { chatAiProcessingEnabled } from '../../src/services/ai-policy';

describe('chatAiProcessingEnabled', () => {
  it('processes a 1:1 by default', () => {
    expect(chatAiProcessingEnabled({ is_group: false, ai_enabled: null })).toBe(true);
  });

  it('does not process a group by default', () => {
    expect(chatAiProcessingEnabled({ is_group: true, ai_enabled: null })).toBe(false);
  });

  it('honours an explicit opt-in on a group', () => {
    expect(chatAiProcessingEnabled({ is_group: true, ai_enabled: true })).toBe(true);
  });

  it('honours an explicit opt-out on a 1:1', () => {
    expect(chatAiProcessingEnabled({ is_group: false, ai_enabled: false })).toBe(false);
  });

  it('treats a missing ai_enabled the same as an explicit null', () => {
    // Callers that select a narrower column set must not accidentally read as
    // "opted out" — undefined means undecided, exactly like null.
    expect(chatAiProcessingEnabled({ is_group: true })).toBe(false);
    expect(chatAiProcessingEnabled({ is_group: false })).toBe(true);
  });

  it('fails closed on a missing chat', () => {
    expect(chatAiProcessingEnabled(null)).toBe(false);
    expect(chatAiProcessingEnabled(undefined)).toBe(false);
  });

  it('does not let a false ai_enabled be overridden by is_group', () => {
    // The user's explicit choice outranks the default in both directions; this
    // is what makes changing the default later safe.
    expect(chatAiProcessingEnabled({ is_group: true, ai_enabled: false })).toBe(false);
  });
});
