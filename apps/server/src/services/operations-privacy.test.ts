import { describe, expect, it } from 'bun:test';
import { sanitizeOperationsDetails } from './operations-privacy';

describe('sanitizeOperationsDetails', () => {
  it('keeps the health allowlist and rejects chat-shaped fields', () => {
    expect(sanitizeOperationsDetails({
      latencyMs: 18,
      error: 'PGRST116',
      content: 'private message',
      contactName: 'Luc',
      token: 'secret',
    })).toEqual({ latencyMs: 18, error: 'PGRST116' });
  });
});
