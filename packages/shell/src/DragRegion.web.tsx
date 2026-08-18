import React, { type ReactNode } from 'react';
import { View } from '@tamagui/core';

/**
 * `-webkit-app-region` is only meaningful inside Electron; a browser ignores
 * it, so this needs no capability check. Interactive children must opt out
 * with `draggable={false}` or the window swallows their clicks.
 */
export function DragRegion({ children, draggable = true, flex, height, style }: {
  children?: ReactNode;
  draggable?: boolean;
  flex?: number;
  height?: number;
  style?: object;
}) {
  return (
    <View
      flex={flex}
      height={height}
      style={{ WebkitAppRegion: draggable ? 'drag' : 'no-drag', ...style } as object}
    >
      {children}
    </View>
  );
}
