import React, { type ReactNode } from 'react';
import { View } from '@tamagui/core';
import { ClaireText, colors } from '@claire/design-system';

export type DesktopDestination = {
  /** expo-router path. */
  route: string;
  label: string;
  icon: (props: { size: number; color: string; strokeWidth?: number }) => ReactNode;
  /** Additional URL prefixes owned by this destination (for example /chat). */
  activeRoutes?: string[];
  /** Utility destinations sit below the primary workspace navigation. */
  placement?: 'primary' | 'bottom';
};

/**
 * The upper dark cap is deliberately part of the rail contract: an expanded
 * rail reads as one uninterrupted surface, while the compact rail starts below
 * the macOS title bar so it does not compete with the traffic lights.
 */
export function DesktopNavigationRailTitleBarBackdrop({
  expanded,
  width,
}: {
  expanded: boolean;
  width: number;
}) {
  if (!expanded) return null;

  return (
    <View
      style={{ pointerEvents: 'none' }}
      position="absolute"
      left={0}
      top={0}
      bottom={0}
      width={width}
      backgroundColor="$ink"
    />
  );
}

export function DesktopNavigationRail({
  collapsed,
  width,
  destinations,
  activeRoute,
  onNavigate,
}: {
  collapsed: boolean;
  width: number;
  destinations: DesktopDestination[];
  activeRoute: string;
  onNavigate: (route: string) => void;
}) {
  const primary = destinations.filter((destination) => destination.placement !== 'bottom');
  const bottom = destinations.filter((destination) => destination.placement === 'bottom');

  const destinationButton = (destination: DesktopDestination) => {
    const active = isRouteActive(activeRoute, destination.route, destination.activeRoutes);
    return (
      <View
        key={destination.route}
        role="button"
        aria-label={destination.label}
        aria-selected={active}
        onPress={() => onNavigate(destination.route)}
        testID={`desktop-nav-${slug(destination.label)}`}
        width={collapsed ? 40 : '100%'}
        height={40}
        borderRadius={11}
        cursor="pointer"
        paddingHorizontal={collapsed ? 0 : '$2'}
        flexDirection="row"
        columnGap="$2"
        alignItems="center"
        justifyContent={collapsed ? 'center' : 'flex-start'}
        backgroundColor={active ? '$neutral800' : 'transparent'}
        hoverStyle={{ backgroundColor: '$neutral800' }}
        pressStyle={{ opacity: 0.84 }}
      >
        {destination.icon({
          size: 22,
          color: active ? colors.lime : colors.neutral[300],
          strokeWidth: 1.9,
        })}
        {!collapsed ? (
          <ClaireText
            variant="label"
            color={active ? '$lime' : '$neutral300'}
            numberOfLines={1}
          >
            {destination.label}
          </ClaireText>
        ) : null}
      </View>
    );
  };

  return (
    <View
      width={width}
      flexGrow={0}
      flexShrink={0}
      backgroundColor="$ink"
      borderRightWidth={1}
      borderRightColor={collapsed ? '$neutral200' : '$ink'}
      paddingHorizontal="$2"
      paddingTop="$3"
      rowGap={2}
      alignItems="center"
      testID="desktop-navigation-rail"
    >
      {primary.map(destinationButton)}
      <View flex={1} />
      {bottom.map(destinationButton)}
    </View>
  );
}

/** `/` must only match itself; all other destinations own their subtree. */
function isRouteActive(current: string, route: string, aliases: string[] = []): boolean {
  if (route === '/') return current === '' || current === '/';
  return [route, ...aliases].some(
    (candidate) => current === candidate || current.startsWith(`${candidate}/`),
  );
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}
