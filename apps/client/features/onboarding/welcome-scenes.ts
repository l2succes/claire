import { colors } from '@claire/design-system';
import { Platform } from '../../types/platform';

export const WELCOME_SCENES = [
  { id: 'connected', accessibilityLabel: 'Connected conversations', title: null, description: 'WhatsApp, Instagram, iMessage, all in one.', compactDescription: true, color: colors.sky },
  { id: 'catch-up', accessibilityLabel: 'Catch up in a moment', title: 'Catch up in a moment.', description: 'Let Claire find the plans and details\nburied in your conversations.', compactDescription: false, color: colors.mint },
  { id: 'remember', accessibilityLabel: 'Make room for real life', title: 'Make room for real life.', description: 'Turn “I’ll get back to you”\ninto a follow-up you remember.', compactDescription: false, color: colors.lavender },
] as const;

export const WELCOME_PLATFORMS = [
  { platform: Platform.WHATSAPP, x: -104, y: -55, tilt: -12 },
  { platform: Platform.INSTAGRAM, x: 104, y: -55, tilt: 10 },
  { platform: Platform.IMESSAGE, x: 0, y: 96, tilt: 4 },
] as const;
