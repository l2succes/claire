import { pendingReactions } from '../features/chat/pending-reactions';
import type { ChatMessage } from '@claire/chat-core';

it('keeps a queued reaction on a message after its local ID is replaced', () => {
  const target: ChatMessage = { id: 'optimistic-a', content: 'test', from_me: true,
    timestamp: '2026-09-15T12:00:00Z', metadata: { clientRequestId: 'request-a' } };
  const result = pendingReactions({ messages: [{ ...target, id: 'database-a' }], reactions: {} },
    [{ id: 'optimistic-reaction-a', kind: 'reaction', target, emoji: '👍', message: target }]);
  expect(result['database-a'][0].emoji).toBe('👍');
  expect(result['optimistic-a']).toBeUndefined();
});
