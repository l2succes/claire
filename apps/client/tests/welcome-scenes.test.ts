import { Platform } from '../types/platform';
import { WELCOME_PLATFORMS, WELCOME_SCENES } from '../features/onboarding/welcome-scenes';

describe('welcome introduction', () => {
  it('uses a single compact platform caption on the first scene', () => {
    expect(WELCOME_SCENES[0]).toEqual(expect.objectContaining({
      title: null,
      description: 'WhatsApp, Instagram, iMessage, all in one.',
      compactDescription: true,
    }));
  });

  it('shows only the supported messaging platforms around the Claire assistant', () => {
    expect(WELCOME_PLATFORMS.map(({ platform }) => platform)).toEqual([
      Platform.WHATSAPP,
      Platform.INSTAGRAM,
      Platform.IMESSAGE,
    ]);
    expect(WELCOME_PLATFORMS.map(({ platform }) => platform)).not.toContain(Platform.TELEGRAM);
  });
});
