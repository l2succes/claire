import { describe, expect, it } from 'bun:test';
import { normalizeAssistantCitationLabels, selectCitedSources, selectSourceIndices } from './conversation-assistant-citations';

const sources = Array.from({ length: 6 }, (_, index) => ({
  messageId: `message-${index + 1}`,
  chatId: 'chat-1',
  excerpt: `Source ${index + 1}`,
  senderName: 'Maya',
  fromMe: false,
  timestamp: '2026-09-07T00:00:00.000Z',
  platform: 'whatsapp',
  chatName: 'Maya',
  isGroup: false,
}));

describe('conversation assistant sources', () => {
  it('only returns the valid, material sources selected by the answer', () => {
    expect(selectCitedSources(sources, [4, 2, 4, 9, 1])).toEqual([
      sources[3], sources[1], sources[0],
    ]);
  });

  it('caps visible citations and falls back safely when the model omits them', () => {
    expect(selectCitedSources(sources, [])).toEqual(sources.slice(0, 4));
    expect(selectCitedSources(sources, [1, 2, 3, 4, 5])).toEqual(sources.slice(0, 4));
  });

  it('keeps action evidence within the same four-source citation cap', () => {
    expect(selectSourceIndices(sources.length, [1, 2, 3, 4, 5])).toEqual([1, 2, 3, 4]);
  });

  it('remaps visible labels and removes unsupported relationship or overflow labels', () => {
    expect(normalizeAssistantCitationLabels('Lead [S4], detail [S2], more [S1][S3], overflow [S5], metric [R1].', 6)).toEqual({
      answer: 'Lead [S1], detail [S2], more [S3][S4], overflow, metric.',
      sourceIndices: [4, 2, 1, 3],
    });
  });
});
