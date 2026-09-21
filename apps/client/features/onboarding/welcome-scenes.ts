import { colors } from '@claire/design-system';
import { Platform } from '../../types/platform';

export const WELCOME_SCENES = [
  { title: 'Everyone, together.', description: 'WhatsApp, Telegram, Instagram and iMessage.\nA little less app hopping.', color: colors.sky },
  { title: 'Catch up in a moment.', description: 'Let Claire find the plans and details\nburied in your conversations.', color: colors.mint },
  { title: 'Make room for real life.', description: 'Turn “I’ll get back to you”\ninto a follow-up you remember.', color: colors.lavender },
] as const;

export const WELCOME_PLATFORMS = [
  { platform: Platform.WHATSAPP, x: -104, y: -60, tilt: -12 },
  { platform: Platform.TELEGRAM, x: 100, y: -67, tilt: 10 },
  { platform: Platform.INSTAGRAM, x: -91, y: 66, tilt: -8 },
  { platform: Platform.IMESSAGE, x: 108, y: 59, tilt: 12 },
] as const;
