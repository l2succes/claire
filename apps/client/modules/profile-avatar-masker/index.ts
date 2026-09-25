import { requireNativeModule } from 'expo';

type ProfileAvatarMasker = {
  createMaskedAvatar(sourceURL: string): Promise<string>;
};

/**
 * Returns a 24-point, center-cropped circular PNG with an ink outline and
 * presence dot. NativeTabs renders it inside the system-selected glass pill.
 */
export async function createMaskedProfileAvatar(sourceURL: string): Promise<string | null> {
  if (process.env.EXPO_OS !== 'ios') return null;

  const nativeModule = requireNativeModule<ProfileAvatarMasker>('ProfileAvatarMasker');
  return nativeModule.createMaskedAvatar(sourceURL);
}
