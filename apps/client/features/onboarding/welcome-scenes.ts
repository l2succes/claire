import { colors } from '@claire/design-system';
import { Platform } from '../../types/platform';

export const WELCOME_HEADLINE = 'Your chats.\nOne AI.';
export const WELCOME_AUTO_ADVANCE_MS = 3_000;

export const WELCOME_SCENES = [
  { id: 'connected', accessibilityLabel: 'Chats and AI assistant', title: 'Chats + AI Assistant', description: 'WhatsApp, Telegram, Instagram and iMessage.', compactDescription: false, color: colors.sky },
  { id: 'catch-up', accessibilityLabel: 'Catch up in a moment', title: 'Catch up in a moment.', description: 'Let Claire find the plans and details\nburied in your conversations.', compactDescription: false, color: colors.mint },
  { id: 'remember', accessibilityLabel: 'Make room for real life', title: 'Make room for real life.', description: 'Turn “I’ll get back to you”\ninto a follow-up you remember.', compactDescription: false, color: colors.lavender },
] as const;

export const WELCOME_PLATFORMS = [
  { platform: Platform.WHATSAPP, x: -104, y: -60, tilt: -12 },
  { platform: Platform.TELEGRAM, x: 100, y: -67, tilt: 10 },
  { platform: Platform.INSTAGRAM, x: -91, y: 66, tilt: -8 },
  { platform: Platform.IMESSAGE, x: 108, y: 59, tilt: 12 },
] as const;

export function nextWelcomeScene(index: number) {
  return (index + 1) % WELCOME_SCENES.length;
}
