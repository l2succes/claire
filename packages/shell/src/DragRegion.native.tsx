import React, { type ReactNode } from 'react';
import { View } from '@tamagui/core';

/** Phones have no draggable window chrome; this is a plain container. */
export function DragRegion({ children, flex, height }: {
  children?: ReactNode;
  draggable?: boolean;
  flex?: number;
  height?: number;
  style?: object;
}) {
  return <View flex={flex} height={height}>{children}</View>;
}
