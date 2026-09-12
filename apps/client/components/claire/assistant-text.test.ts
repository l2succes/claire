import { parseAssistantText } from './assistant-text';

describe('Ask Claire rich text', () => {
  it('formats bold spans and list markers without exposing markdown syntax', () => {
    expect(parseAssistantText('A short answer.\n\n- **Mexico City:** No confirmed contacts.')).toEqual([
      { marker: null, runs: [{ text: 'A short answer.', bold: false }] },
      { marker: '•', runs: [
        { text: 'Mexico City:', bold: true },
        { text: ' No confirmed contacts.', bold: false },
      ] },
    ]);
  });
});
