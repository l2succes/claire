import { Platform } from '../types/platform';
import { WELCOME_HEADLINE, WELCOME_PLATFORMS, WELCOME_SCENES } from '../features/onboarding/welcome-scenes';

describe('welcome introduction', () => {
  it('uses the selected two-line headline', () => {
    expect(WELCOME_HEADLINE).toBe('Your chats.\nOne AI.');
  });

  it('keeps the first scene title and platform copy in the shared slide layout', () => {
    expect(WELCOME_SCENES[0]).toEqual(expect.objectContaining({
      title: 'Chats + AI Assistant',
      description: 'WhatsApp, Telegram, Instagram and iMessage.',
      compactDescription: false,
    }));
  });

  it('shows the four messaging platforms around the Claire assistant', () => {
    expect(WELCOME_PLATFORMS.map(({ platform }) => platform)).toEqual([
      Platform.WHATSAPP,
      Platform.TELEGRAM,
      Platform.INSTAGRAM,
      Platform.IMESSAGE,
    ]);
  });
});
