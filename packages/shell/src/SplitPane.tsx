import React, { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { PanResponder } from 'react-native';
import { View } from '@tamagui/core';
import { host } from '@claire/host';

/**
 * A fixed-width pane with a draggable edge, for the desktop three-pane inbox.
 *
 * Widths persist per install through the host preference store, so a resized
 * conversation list survives a relaunch — matching the React Native macOS
 * behaviour it replaces.
 */

export const PANE_BOUNDS = {
  conversation: { min: 260, max: 520, initial: 330 },
  inspector: { min: 240, max: 520, initial: 290 },
} as const;

export type PaneKind = keyof typeof PANE_BOUNDS;

export function clampPaneWidth(width: number, kind: PaneKind): number {
  const { min, max } = PANE_BOUNDS[kind];
  if (!Number.isFinite(width)) return PANE_BOUNDS[kind].initial;
  return Math.min(max, Math.max(min, Math.round(width)));
}

export function ResizablePane({
  children,
  kind,
  /** 1 when the handle is on the pane's trailing edge, -1 when leading. */
  edge,
  accessibilityLabel,
  testID,
}: {
  children: ReactNode;
  kind: PaneKind;
  edge: 1 | -1;
  accessibilityLabel: string;
  testID?: string;
}) {
  const [width, setWidth] = useState<number>(PANE_BOUNDS[kind].initial);
  const preferenceKey = `desktop.pane-width.${kind}`;

  useEffect(() => {
    let active = true;
    void host.getPreference(preferenceKey).then((stored) => {
      if (!active || stored == null) return;
      const parsed = Number(stored);
      if (Number.isFinite(parsed)) setWidth(clampPaneWidth(parsed, kind));
    });
    return () => {
      active = false;
    };
  }, [kind, preferenceKey]);

  const commitWidth = useCallback(
    (next: number) => {
      const clamped = clampPaneWidth(next, kind);
      setWidth(clamped);
      return clamped;
    },
    [kind],
  );

  const persist = useCallback(
    (value: number) => {
      void host.setPreference(preferenceKey, String(value));
    },
    [preferenceKey],
  );

  const handle = (
    <PaneResizeHandle
      accessibilityLabel={accessibilityLabel}
      edge={edge}
      width={width}
      onWidthChange={commitWidth}
      onWidthCommit={persist}
    />
  );

  return (
    <>
      {edge === -1 ? handle : null}
      <View width={width} flexGrow={0} flexShrink={0} minWidth={0} testID={testID}>
        {children}
      </View>
      {edge === 1 ? handle : null}
    </>
  );
}

function PaneResizeHandle({
  accessibilityLabel,
  edge,
  width,
  onWidthChange,
  onWidthCommit,
}: {
  accessibilityLabel: string;
  edge: 1 | -1;
  width: number;
  onWidthChange: (width: number) => number;
  onWidthCommit: (width: number) => void;
}) {
  // The width at grab time. Reading state inside the responder would capture a
  // stale value mid-drag, so the drag origin is held in a ref.
  const dragStartWidth = useRef(width);
  const latestWidth = useRef(width);
  latestWidth.current = width;

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 2,
        onPanResponderGrant: () => {
          dragStartWidth.current = latestWidth.current;
        },
        onPanResponderMove: (_event, gesture) => {
          onWidthChange(dragStartWidth.current + gesture.dx * edge);
        },
        // Persisting on every move would write hundreds of times per drag.
        onPanResponderRelease: () => onWidthCommit(latestWidth.current),
        onPanResponderTerminate: () => onWidthCommit(latestWidth.current),
      }),
    [edge, onWidthChange, onWidthCommit],
  );

  return (
    <View
      aria-label={accessibilityLabel}
      role="slider"
      {...responder.panHandlers}
      width={6}
      flexGrow={0}
      flexShrink={0}
      cursor="col-resize"
      backgroundColor="transparent"
      hoverStyle={{ backgroundColor: '$neutral200' }}
    />
  );
}
