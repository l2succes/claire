import { requireNativeModule } from 'expo';
import { Platform } from 'react-native';

type ProfileAvatarMasker = {
  createMaskedAvatar(sourceURL: string): Promise<string>;
};

/**
 * Returns a 24-point, center-cropped circular PNG with a light border. The
 * NativeTabs renderer uses the final image directly, so no custom tab bar is
 * needed to make a remote avatar round.
 */
export async function createMaskedProfileAvatar(sourceURL: string): Promise<string | null> {
  if (Platform.OS !== 'ios') return null;

  const nativeModule = requireNativeModule<ProfileAvatarMasker>('ProfileAvatarMasker');
  return nativeModule.createMaskedAvatar(sourceURL);
}
