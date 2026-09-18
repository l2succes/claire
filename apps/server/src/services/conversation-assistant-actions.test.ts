import { describe, expect, it } from 'bun:test';
import { selectAssistantActions } from './conversation-assistant-actions';

const citations = [
  {
    chatId: 'chat-noah',
    chatName: 'Noah',
    platform: 'whatsapp',
    isGroup: false,
    excerpt: 'Let’s meet for coffee next week.',
  },
  {
    chatId: 'chat-maya',
    chatName: 'Maya',
    platform: 'instagram',
    isGroup: false,
    excerpt: 'The deck is ready for review.',
  },
];

describe('conversation assistant actions', () => {
  it('only opens a conversation represented by a selected source', () => {
    expect(selectAssistantActions(citations, [
      { type: 'open_conversation', sourceIndex: 2, label: 'Open Maya' },
      { type: 'open_conversation', sourceIndex: 1, label: 'Open Noah' },
    ], [1])).toEqual([{
      type: 'open_conversation', label: 'Open Noah', chatId: 'chat-noah', chatName: 'Noah', platform: 'whatsapp', isGroup: false,
    }]);
  });

  it('only offers calendar planning when the selected evidence indicates a meeting', () => {
    expect(selectAssistantActions(citations, [
      { type: 'open_calendar', sourceIndex: 1, label: 'Plan coffee', title: 'Coffee with Noah', startsAt: '2026-09-10T18:00:00.000Z' },
      { type: 'open_calendar', sourceIndex: 2, label: 'Plan review', title: 'Review' },
    ], [1, 2])).toEqual([{
      type: 'open_calendar', label: 'Plan coffee', title: 'Coffee with Noah', startsAt: '2026-09-10T18:00:00.000Z',
    }]);
  });
});
