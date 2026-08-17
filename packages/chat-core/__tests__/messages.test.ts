import {
  chatMessageFromSend,
  isBridgeFailure,
  isLocalSend,
  keepPendingSends,
  mergeChatMessage,
  mergeChronologicalMessages,
} from '../src/messages';
import type { ChatMessage } from '../src/types';

const base: ChatMessage = {
  id: 'server-1',
  content: 'hello',
  timestamp: '2026-08-17T10:00:00.000Z',
  from_me: false,
};

const message = (over: Partial<ChatMessage> = {}): ChatMessage => ({ ...base, ...over });

describe('isLocalSend', () => {
  it.each([
    ['optimistic-123', true],
    ['local-123', true],
    ['server-1', false],
    ['b1b8f2c4-0000-4000-8000-000000000000', false],
  ])('%s -> %s', (id, expected) => {
    expect(isLocalSend(id)).toBe(expected);
  });
});

describe('mergeChatMessage', () => {
  it('updates in place when the id already exists', () => {
    const prev = [message({ id: 'a', content: 'old' })];
    const next = mergeChatMessage(prev, message({ id: 'a', content: 'new' }));
    expect(next).toHaveLength(1);
    expect(next[0].content).toBe('new');
  });

  it('replaces an optimistic row with the confirmed one rather than duplicating', () => {
    const prev = [message({ id: 'optimistic-1', content: 'yo', from_me: true })];
    const next = mergeChatMessage(prev, message({ id: 'server-9', content: 'yo', from_me: true }));
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe('server-9');
  });

  it('does not collapse an inbound message onto an optimistic one with the same text', () => {
    const prev = [message({ id: 'optimistic-1', content: 'yo', from_me: true })];
    const next = mergeChatMessage(prev, message({ id: 'server-9', content: 'yo', from_me: false }));
    expect(next).toHaveLength(2);
  });

  it('appends anything unrelated', () => {
    const next = mergeChatMessage([message({ id: 'a' })], message({ id: 'b' }));
    expect(next.map((row) => row.id)).toEqual(['a', 'b']);
  });
});

describe('keepPendingSends', () => {
  it('carries an in-flight send across a refetch', () => {
    const server = [message({ id: 's1', timestamp: '2026-08-17T10:00:00.000Z' })];
    const current = [
      message({ id: 'optimistic-1', content: 'pending', from_me: true, timestamp: '2026-08-17T10:05:00.000Z' }),
    ];
    const next = keepPendingSends(server, current);
    expect(next.map((row) => row.id)).toEqual(['s1', 'optimistic-1']);
  });

  it('drops a pending row the server has since confirmed by content', () => {
    const server = [message({ id: 's2', content: 'pending', from_me: true })];
    const current = [message({ id: 'optimistic-1', content: 'pending', from_me: true })];
    expect(keepPendingSends(server, current)).toHaveLength(1);
  });

  it('sorts chronologically', () => {
    const server = [
      message({ id: 'b', timestamp: '2026-08-17T12:00:00.000Z' }),
      message({ id: 'a', timestamp: '2026-08-17T09:00:00.000Z' }),
    ];
    expect(keepPendingSends(server, []).map((row) => row.id)).toEqual(['a', 'b']);
  });
});

describe('mergeChronologicalMessages', () => {
  it('replaces a rendered row with a newer server copy of the same id', () => {
    const current = [message({ id: 'a', content: 'old' })];
    const next = mergeChronologicalMessages(current, [message({ id: 'a', content: 'new' })]);
    expect(next).toHaveLength(1);
    expect(next[0].content).toBe('new');
  });

  it('settles new rows into timestamp order', () => {
    const current = [message({ id: 'b', timestamp: '2026-08-17T12:00:00.000Z' })];
    const incoming = [message({ id: 'a', timestamp: '2026-08-17T09:00:00.000Z' })];
    expect(mergeChronologicalMessages(current, incoming).map((row) => row.id)).toEqual(['a', 'b']);
  });

  it('works on any row carrying id and timestamp, not just ChatMessage', () => {
    // Desktop's message type has nullable content and a delivery_state.
    const desktopish = [{ id: 'd1', timestamp: '2026-08-17T10:00:00.000Z', delivery_state: 'sending' as const }];
    expect(mergeChronologicalMessages(desktopish, [])).toHaveLength(1);
  });
});

describe('chatMessageFromSend', () => {
  it('keeps the optimistic id so the list does not re-key', () => {
    const fallback = message({ id: 'optimistic-1', from_me: true });
    const next = chatMessageFromSend({ id: 'ignored', content: 'sent' }, fallback);
    expect(next.id).toBe('optimistic-1');
    expect(next.content).toBe('sent');
    expect(next.from_me).toBe(true);
  });

  it('accepts either platformMessageId spelling', () => {
    const fallback = message({ id: 'optimistic-1' });
    expect(chatMessageFromSend({ platformMessageId: '$evt' }, fallback).platform_message_id).toBe('$evt');
    expect(chatMessageFromSend({ platform_message_id: '$evt' }, fallback).platform_message_id).toBe('$evt');
  });

  it('normalizes a Date timestamp to ISO', () => {
    const fallback = message({ id: 'optimistic-1' });
    const when = new Date('2026-08-17T11:22:33.000Z');
    expect(chatMessageFromSend({ timestamp: when }, fallback).timestamp).toBe(when.toISOString());
  });

  it('falls back when the payload is not an object', () => {
    const fallback = message({ id: 'optimistic-1' });
    expect(chatMessageFromSend(null, fallback)).toBe(fallback);
    expect(chatMessageFromSend('nope', fallback)).toBe(fallback);
  });
});

describe('isBridgeFailure', () => {
  it.each([
    ['* Failed to bridge media: too large', true],
    ['Failed to bridge media', true],
    ['Failed to deliver', false],
    ['', false],
    [undefined, false],
  ])('%s -> %s', (content, expected) => {
    expect(isBridgeFailure(content as string | undefined)).toBe(expected);
  });
});
