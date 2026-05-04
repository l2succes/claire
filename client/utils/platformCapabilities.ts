import { Platform } from 'react-native';

export const isWeb = Platform.OS === 'web';
export const isNative = Platform.OS !== 'web';

export const platformCapabilities = {
  isWeb,
  isNative,
  supportsNativeNotifications: isNative,
  supportsEmbeddedInstagramLogin: isNative,
  supportsInstagramBrowserAssist: isWeb,
};

export type InstagramLoginMode = 'embedded' | 'browser_assisted';

export function getInstagramLoginMode(): InstagramLoginMode {
  return platformCapabilities.supportsEmbeddedInstagramLogin
    ? 'embedded'
    : 'browser_assisted';
}
