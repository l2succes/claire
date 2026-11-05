import { readChatPlatform } from '../services/chat-route-params';

describe('chat platform route hints', () => {
  it.each(['whatsapp', 'telegram', 'instagram', 'imessage'])('reads new and legacy %s links', (platform) => {
    expect(readChatPlatform({ chatPlatform: platform })).toBe(platform);
    expect(readChatPlatform({ platform })).toBe(platform);
  });

  it('prefers the new hint when both are present', () => {
    expect(readChatPlatform({ chatPlatform: 'telegram', platform: 'whatsapp' })).toBe('telegram');
  });

  it('accepts repeated query parameters and ignores unsupported hints', () => {
    expect(readChatPlatform({ chatPlatform: [' instagram ', 'telegram'] })).toBe('instagram');
    expect(readChatPlatform({ chatPlatform: 'web', platform: ['imessage'] })).toBe('imessage');
    expect(readChatPlatform({ chatPlatform: 'unknown' })).toBeUndefined();
    expect(readChatPlatform({})).toBeUndefined();
  });
});
