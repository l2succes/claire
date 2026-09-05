import { isSingleEmojiMessage } from '../src/emoji';

describe('isSingleEmojiMessage', () => {
  it.each(['😢', '❤️', '👍🏽', '👩🏽‍💻', '🇲🇽', '1️⃣', '  😢\n'])('accepts %s', (value) => {
    expect(isSingleEmojiMessage(value)).toBe(true);
  });

  it.each(['', 'hello', 'hello 😢', '😢😢', '😢!', 'https://example.com'])('rejects %s', (value) => {
    expect(isSingleEmojiMessage(value)).toBe(false);
  });
});

