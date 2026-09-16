import { describe, expect, it } from 'bun:test';
import { outgoingTransactionId } from './outgoing-request-id';

describe('outgoing Matrix transaction IDs', () => {
  it('reuses a transaction across retries but isolates account, chat, and event type', () => {
    const id = outgoingTransactionId('u', 's', 'c', 'text', 'request');
    expect(outgoingTransactionId('u', 's', 'c', 'text', 'request')).toBe(id);
    expect(outgoingTransactionId('other', 's', 'c', 'text', 'request')).not.toBe(id);
    expect(outgoingTransactionId('u', 's', 'other', 'text', 'request')).not.toBe(id);
    expect(outgoingTransactionId('u', 's', 'c', 'reaction', 'request')).not.toBe(id);
  });
  it('preserves legacy callers and validates supplied IDs', () => {
    expect(outgoingTransactionId('u', 's', 'c', 'text', undefined)).toBeUndefined();
    expect(() => outgoingTransactionId('u', 's', 'c', 'text', {})).toThrow();
    expect(() => outgoingTransactionId('u', 's', 'c', 'text', 'x'.repeat(513))).toThrow();
  });
});
