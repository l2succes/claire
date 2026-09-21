import { useEffect, useState } from 'react';
import { createMaskedProfileAvatar } from '../modules/profile-avatar-masker';

/** Turns the signed-in user's remote photo into a native tab-sized icon. */
export function useMaskedTabAvatar(sourceURL?: string | null) {
  const [result, setResult] = useState<{ sourceURL: string | null; maskedAvatarURL: string | null }>({
    sourceURL: null,
    maskedAvatarURL: null,
  });

  useEffect(() => {
    let cancelled = false;
    if (!sourceURL) {
      setResult({ sourceURL: null, maskedAvatarURL: null });
      return () => { cancelled = true; };
    }

    void createMaskedProfileAvatar(sourceURL)
      .then((nextURL) => {
        if (!cancelled) setResult({ sourceURL, maskedAvatarURL: nextURL });
      })
      .catch(() => {
        // A missing or private avatar should leave the reliable SF Symbol
        // fallback in place instead of affecting the Liquid Glass tab bar.
        if (!cancelled) setResult({ sourceURL, maskedAvatarURL: null });
      });

    return () => { cancelled = true; };
  }, [sourceURL]);

  return {
    avatarURL: result.maskedAvatarURL,
    // NativeTabs does not reliably replace an icon source after its trigger
    // mounts. Hold that one trigger tree until its source is ready instead.
    isLoading: Boolean(sourceURL && result.sourceURL !== sourceURL),
  };
}
