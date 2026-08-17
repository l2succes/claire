export type DesktopCommand = 'home' | 'inbox' | 'promises' | 'people' | 'search' | 'settings' | 'compose' | 'compact';

export type DesktopDestination = 'Home' | 'Inbox' | 'Promises' | 'People' | 'Search' | 'Settings';

const destinationByCommand: Record<DesktopCommand, DesktopDestination> = {
  home: 'Home',
  inbox: 'Inbox',
  promises: 'Promises',
  people: 'People',
  search: 'Search',
  settings: 'Settings',
  compose: 'Inbox',
  compact: 'Inbox',
};

/** The stable bridge contract between native macOS shortcuts and the RN workspace. */
export function destinationForDesktopCommand(command: DesktopCommand): DesktopDestination {
  return destinationByCommand[command];
}

export const desktopPaneBounds = {
  conversation: { min: 300, max: 460 },
  inspector: { min: 280, max: 420 },
} as const;

export function clampDesktopPaneWidth(value: number, pane: keyof typeof desktopPaneBounds): number {
  const bounds = desktopPaneBounds[pane];
  return Math.max(bounds.min, Math.min(bounds.max, Math.round(value)));
}

/** Column count and item width for wrap grids. Yoga on macOS mishandles flexBasis + flexGrow + columnGap. */
export function desktopWrapGridMetrics(width: number, itemCount: number, minItemWidth = 320, gap = 12) {
  if (width <= 0 || itemCount <= 0) return { columns: 1, itemWidth: 0 };
  const columns = Math.max(1, Math.min(itemCount, Math.floor((width + gap) / (minItemWidth + gap))));
  return { columns, itemWidth: (width - gap * (columns - 1)) / columns };
}
