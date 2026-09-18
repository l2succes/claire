import { Platform } from '../../types/platform';

export type ConnectionSource = 'onboarding' | 'settings';
export type ConnectionSetupSurface = 'phone' | 'desktop' | 'mac';

export type ConnectionPlatformConfig = {
  platform: Platform;
  name: string;
  detail: string;
  setupSurface: ConnectionSetupSurface;
};

export const CONNECTION_PLATFORM_CONFIG: Record<Platform, ConnectionPlatformConfig> = {
  [Platform.WHATSAPP]: {
    platform: Platform.WHATSAPP,
    name: 'WhatsApp',
    detail: 'About 2 minutes · Phone pairing',
    setupSurface: 'phone',
  },
  [Platform.TELEGRAM]: {
    platform: Platform.TELEGRAM,
    name: 'Telegram',
    detail: 'About 1 minute · Verify in Telegram',
    setupSurface: 'phone',
  },
  [Platform.INSTAGRAM]: {
    platform: Platform.INSTAGRAM,
    name: 'Instagram',
    detail: 'One-time setup in Claire Desktop',
    setupSurface: 'desktop',
  },
  [Platform.IMESSAGE]: {
    platform: Platform.IMESSAGE,
    name: 'iMessage',
    detail: 'Requires a Mac that stays online',
    setupSurface: 'mac',
  },
};

export const PHONE_CONNECTION_PLATFORMS = [Platform.WHATSAPP, Platform.TELEGRAM] as const;
export const COMPANION_CONNECTION_PLATFORMS = [Platform.INSTAGRAM, Platform.IMESSAGE] as const;

export function connectionRoute(platform: Platform, source: ConnectionSource) {
  return {
    pathname: '/connections/[platform]' as const,
    params: { platform, source },
  };
}
