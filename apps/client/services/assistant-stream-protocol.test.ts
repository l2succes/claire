import { parseAssistantSseEvent } from './assistant-stream-protocol';

describe('Ask Claire UI stream protocol', () => {
  it('parses text deltas from AI SDK SSE frames', () => {
    expect(parseAssistantSseEvent('data: {"type":"text-delta","id":"a","delta":"Hello"}\n\n'))
      .toMatchObject({ type: 'text-delta', delta: 'Hello' });
  });

  it('ignores the terminal sentinel', () => {
    expect(parseAssistantSseEvent('data: [DONE]\n\n')).toBeNull();
  });

  it('parses typed Claire result data', () => {
    expect(parseAssistantSseEvent('data: {"type":"data-claire-result","data":{"answer":"Done"}}\n\n'))
      .toMatchObject({ type: 'data-claire-result', data: { answer: 'Done' } });
  });
});
