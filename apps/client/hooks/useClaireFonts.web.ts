import { useEffect, useState } from 'react';
import { Asset } from 'expo-asset';

/**
 * Declare the Claire families to the browser.
 *
 * The expo-font config plugin only embeds fonts for native builds, so before
 * this existed the web and Electron clients asked for "Public Sans" / "Inter" /
 * "DM Mono" and silently fell back to the system face — the most visible way
 * the web build drifted from native.
 *
 * `expo-font`'s `useFonts` cannot express this: it keys a map by family name,
 * so it can register exactly one weight per family. Claire's tokens use one
 * family across four weights and let `fontWeight` select, which means the
 * browser needs four @font-face rules sharing a family name. So we resolve the
 * asset URLs (which is also what makes Metro emit the .ttf files for web at
 * all) and register each face directly.
 */

type FaceSpec = {
  family: string;
  weight: number;
  /** Metro asset module. */
  module: number;
};

const FACES: FaceSpec[] = [
  { family: 'Public Sans', weight: 400, module: require('../assets/fonts/PublicSans-Regular.ttf') },
  { family: 'Public Sans', weight: 500, module: require('../assets/fonts/PublicSans-Medium.ttf') },
  { family: 'Public Sans', weight: 600, module: require('../assets/fonts/PublicSans-SemiBold.ttf') },
  { family: 'Public Sans', weight: 700, module: require('../assets/fonts/PublicSans-Bold.ttf') },
  { family: 'Inter', weight: 600, module: require('../assets/fonts/Inter-SemiBold.ttf') },
  { family: 'Inter', weight: 700, module: require('../assets/fonts/Inter-Bold.ttf') },
  { family: 'DM Mono', weight: 400, module: require('../assets/fonts/DMMono-Regular.ttf') },
  { family: 'DM Mono', weight: 500, module: require('../assets/fonts/DMMono-Medium.ttf') },
];

let loadPromise: Promise<void> | null = null;

function loadFaces(): Promise<void> {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    if (typeof document === 'undefined' || typeof FontFace === 'undefined') return;

    await Promise.all(
      FACES.map(async (face) => {
        try {
          const uri = Asset.fromModule(face.module).uri;
          const fontFace = new FontFace(face.family, `url(${uri})`, {
            weight: String(face.weight),
            style: 'normal',
            // Claire's chrome is dense and type-led: a swap from fallback
            // metrics reflows every conversation row. The assets are
            // same-origin, so the block window stays short.
            display: 'block',
          });
          await fontFace.load();
          document.fonts.add(fontFace);
        } catch {
          // A missing weight must not block the app from rendering. The
          // browser falls back for that one face only.
        }
      }),
    );
  })();

  return loadPromise;
}

export function useClaireFonts(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadFaces().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return ready;
}
