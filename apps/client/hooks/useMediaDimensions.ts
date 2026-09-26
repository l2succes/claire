import { useCallback, useState } from 'react';
import type { VisualMedia } from '@claire/chat-core';

const measured = new Map<string, { width: number; height: number }>();

/** Remember loaded dimensions so recycled timeline rows keep their height. */
export function useMediaDimensions(media: VisualMedia) {
  const [loaded, setLoaded] = useState(() => measured.get(media.uri));
  const onDimensions = useCallback((width: number, height: number) => {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
    const size = { width, height };
    measured.delete(media.uri);
    measured.set(media.uri, size);
    if (measured.size > 128) measured.delete(measured.keys().next().value!);
    setLoaded((previous) => previous?.width === width && previous.height === height ? previous : size);
  }, [media.uri]);
  return { width: media.width ?? loaded?.width, height: media.height ?? loaded?.height, onDimensions };
}
