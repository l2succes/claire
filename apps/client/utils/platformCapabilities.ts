import { Platform } from 'react-native';

export const isWeb = Platform.OS === 'web';
export const isNative = Platform.OS !== 'web';

export const platformCapabilities = {
  isWeb,
  isNative,
  supportsNativeNotifications: isNative,
  // Instagram's login page intentionally does not support embedded WebViews
  // consistently. Use the server-assisted credential/2FA flow on every
  // platform instead of presenting a dead-end native browser surface.
  supportsEmbeddedInstagramLogin: false,
  supportsInstagramBrowserAssist: isWeb,
};

export type InstagramLoginMode = 'embedded' | 'browser_assisted';

export function getInstagramLoginMode(): InstagramLoginMode {
  return platformCapabilities.supportsEmbeddedInstagramLogin
    ? 'embedded'
    : 'browser_assisted';
}
