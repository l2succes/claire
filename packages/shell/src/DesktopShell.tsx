import React, { useCallback, useEffect, useState, type ReactNode } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react-native';
import { View } from '@tamagui/core';
import { ClaireIconButton, ClaireText, colors } from '@claire/design-system';
import { host } from '@claire/host';
import { DragRegion } from './DragRegion';

/**
 * The desktop chrome: title bar, navigation rail, and the content area that
 * hosts whatever route is active.
 *
 * This is a Tier 3 component — it arranges, it does not implement. Everything
 * inside the content area is the same shared UI the phone renders; only the
 * arrangement differs, which is why forking here is cheap.
 *
 * Navigation is expressed as expo-router paths rather than an internal
 * destination enum. That is what keeps URL history, back/forward, and deep
 * links working identically in Electron and the browser.
 */

export type DesktopDestination = {
  /** expo-router path. */
  route: string;
  label: string;
  icon: (props: { size: number; color: string; strokeWidth?: number }) => ReactNode;
};

const RAIL_WIDTH = 148;
const RAIL_WIDTH_COLLAPSED = 84;
const TITLE_BAR_HEIGHT = 52;
const NAV_COLLAPSED_KEY = 'desktop.navigation-collapsed';

export function DesktopShell({
  children,
  destinations,
  activeRoute,
  onNavigate,
}: {
  children: ReactNode;
  destinations: DesktopDestination[];
  activeRoute: string;
  onNavigate: (route: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  // Pane state belongs to this machine, not the account, so it goes through the
  // host preference store rather than the synced profile.
  useEffect(() => {
    let active = true;
    void host.getPreference(NAV_COLLAPSED_KEY).then((value) => {
      if (active && value != null) setCollapsed(value === '1');
    });
    return () => {
      active = false;
    };
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      void host.setPreference(NAV_COLLAPSED_KEY, next ? '1' : '0');
      return next;
    });
  }, []);

  const railWidth = collapsed ? RAIL_WIDTH_COLLAPSED : RAIL_WIDTH;

  return (
    <View flex={1} backgroundColor="$cream">
      <DesktopTitleBar
        collapsed={collapsed}
        railWidth={railWidth}
        onToggleNavigation={toggleCollapsed}
      />
      <View flex={1} flexDirection="row" minHeight={0}>
        <NavigationRail
          collapsed={collapsed}
          width={railWidth}
          destinations={destinations}
          activeRoute={activeRoute}
          onNavigate={onNavigate}
        />
        <View flex={1} minWidth={0} minHeight={0} backgroundColor="$cream">
          {children}
        </View>
      </View>
    </View>
  );
}

function DesktopTitleBar({
  collapsed,
  railWidth,
  onToggleNavigation,
}: {
  collapsed: boolean;
  railWidth: number;
  onToggleNavigation: () => void;
}) {
  return (
    <DragRegion height={TITLE_BAR_HEIGHT}>
      <View
        height={TITLE_BAR_HEIGHT}
        flexDirection="row"
        alignItems="center"
        position="relative"
      >
        {/* The rail colour runs up behind the title bar so the sidebar reads as
            one surface rather than a panel bolted under a toolbar. */}
        <View
          style={{ pointerEvents: 'none' }}
          position="absolute"
          left={0}
          top={0}
          bottom={0}
          width={railWidth}
          backgroundColor="$ink"
        />
        {/* On macOS the traffic lights sit here; the spacer keeps the toggle
            clear of them at both rail widths. */}
        <View width={railWidth} />

        <DragRegion draggable={false}>
          <View paddingLeft="$2" justifyContent="center">
            <ClaireIconButton
              accessibilityLabel={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              onPress={onToggleNavigation}
              width={32}
              height={32}
              borderRadius={10}
              testID="desktop-toggle-sidebar"
            >
              {collapsed ? (
                <PanelLeftOpen size={17} color={colors.ink} />
              ) : (
                <PanelLeftClose size={17} color={colors.ink} />
              )}
            </ClaireIconButton>
          </View>
        </DragRegion>

        {/* Flexible spacer. Search lives behind ⌘K and connections in Settings,
            so neither needs permanent chrome here. */}
        <DragRegion draggable={false} flex={1} />


        <View
          style={{ pointerEvents: 'none' }}
          position="absolute"
          left={railWidth}
          right={0}
          bottom={0}
          height={1}
          backgroundColor="$neutral200"
        />
      </View>
    </DragRegion>
  );
}

function NavigationRail({
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
  return (
    <View
      width={width}
      flexGrow={0}
      flexShrink={0}
      backgroundColor="$ink"
      paddingHorizontal="$2"
      paddingTop="$2"
      rowGap={2}
      testID="desktop-navigation-rail"
    >
      {destinations.map((destination) => {
        const active = isRouteActive(activeRoute, destination.route);
        return (
          <View
            key={destination.route}
            role="button"
            aria-label={destination.label}
            aria-selected={active}
            onPress={() => onNavigate(destination.route)}
            testID={`desktop-nav-${slug(destination.label)}`}
            minHeight={44}
            borderRadius="$control"
            paddingHorizontal="$2"
            flexDirection="row"
            alignItems="center"
            columnGap={10}
            cursor="pointer"
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
              <ClaireText variant="label" color={active ? '$lime' : '$neutral300'} numberOfLines={1}>
                {destination.label}
              </ClaireText>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/**
 * `/` must only match itself, but every other destination owns its subtree —
 * `/chat/abc` should still light up Inbox.
 */
function isRouteActive(current: string, route: string): boolean {
  if (route === '/') return current === '/' || current === '';
  return current === route || current.startsWith(`${route}/`);
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}
