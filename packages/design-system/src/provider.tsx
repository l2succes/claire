import React, { type ReactNode } from 'react';
import { TamaguiProvider, useMedia } from '@tamagui/core';
import { breakpoints } from '@claire/tokens';
import { claireConfig } from './config';

/**
 * Wraps a Claire client in the shared Tamagui configuration.
 *
 * The old `surface` prop is accepted but ignored. It used to pick between two
 * whole type scales for the entire tree, which meant density was decided once
 * at the root; density is now a per-component response to the viewport, so
 * there is nothing left for the prop to select.
 */
export function ClaireThemeProvider({
  children,
  surface: _deprecatedSurface,
}: {
  children: ReactNode;
  /** @deprecated Density follows the viewport. This prop has no effect. */
  surface?: 'desktop' | 'mobile';
}) {
  return (
    <TamaguiProvider config={claireConfig} defaultTheme="light">
      {children}
    </TamaguiProvider>
  );
}

export type ClaireBreakpoint = 'compact' | 'medium' | 'expanded';

/**
 * The current density bucket.
 *
 * Prefer `$compact` / `$gtExpanded` style props, which the Tamagui compiler
 * turns into real CSS on web and so cost nothing at runtime. Reach for this
 * hook only where the *structure* differs — picking the desktop shell over the
 * mobile shell, for instance — rather than the styling.
 */
export function useClaireBreakpoint(): ClaireBreakpoint {
  const media = useMedia();
  if (media.gtExpanded) return 'expanded';
  if (media.gtCompact) return 'medium';
  return 'compact';
}

/** True once the window is wide enough for the three-pane desktop shell. */
export function useIsDesktopLayout(): boolean {
  return useMedia().gtExpanded;
}

export { breakpoints };
