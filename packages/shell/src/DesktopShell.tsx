import React, { useCallback, useEffect, useState, type ReactNode } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react-native';
import { View } from '@tamagui/core';
import { useMedia } from '@tamagui/core';
import {
  ClaireIconButton,
  ClaireText,
  colors,
} from '@claire/design-system';
import { host } from '@claire/host';
import { DragRegion } from './DragRegion';
import {
  DesktopNavigationRail,
  DesktopNavigationRailTitleBarBackdrop,
  type DesktopDestination,
} from './DesktopNavigationRail';

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

export type { DesktopDestination } from './DesktopNavigationRail';

const RAIL_WIDTH = 64;
const TITLE_BAR_HEIGHT = 52;
// Keep interactive title-bar controls out of macOS's traffic-light zone. On
// expanded rails the control also stays aligned just beyond the rail edge.
const TRAFFIC_LIGHT_CLEARANCE = 116;
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
  // Start in the compact, mockup-style rail. A user can expand it on a wide
  // window when labels are more useful than content width.
  const [collapsed, setCollapsed] = useState(true);
  const media = useMedia();

  // Pane state belongs to this machine, not the account, so it goes through the
  // host preference store rather than the synced profile.
  useEffect(() => {
    let active = true;
    void host.getPreference(NAV_COLLAPSED_KEY).then((value) => {
      if (active && value != null) setCollapsed(value !== '0');
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

  // The desktop reference uses one familiar, icon-first rail at every desktop
  // width. Labels belong to the content panes, never to a second navigation
  // column that steals room from the workspace.
  const visiblyCollapsed = collapsed || !media.gtWide;
  const railWidth = visiblyCollapsed ? RAIL_WIDTH : 164;

  return (
    <View flex={1} backgroundColor="$cream">
      <DesktopTitleBar
        collapsed={visiblyCollapsed}
        railWidth={railWidth}
        onToggleNavigation={toggleCollapsed}
      />
      <View flex={1} flexDirection="row" minHeight={0}>
        <DesktopNavigationRail
          collapsed={visiblyCollapsed}
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
  const leadingClearance = Math.max(railWidth + 16, TRAFFIC_LIGHT_CLEARANCE);

  return (
    <DragRegion height={TITLE_BAR_HEIGHT}>
      <View
        height={TITLE_BAR_HEIGHT}
        flexDirection="row"
        alignItems="center"
        position="relative"
        backgroundColor="$cream"
      >
        <DesktopNavigationRailTitleBarBackdrop expanded={!collapsed} width={railWidth} />
        {/* Compact navigation begins below the title bar, leaving a calm gray
            traffic-light zone. The expanded rail intentionally caps it. */}
        <View width={leadingClearance} />

        <DragRegion draggable={false}>
          <View paddingLeft="$1" justifyContent="center">
            <ClaireIconButton
              accessibilityLabel={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              onPress={onToggleNavigation}
              width={32}
              height={32}
              borderRadius={10}
              testID="desktop-toggle-sidebar"
            >
              {collapsed ? <PanelLeftOpen size={17} color={colors.ink} /> : <PanelLeftClose size={17} color={colors.ink} />}
            </ClaireIconButton>
          </View>
        </DragRegion>

        {/* Flexible spacer. Search is on ⌘K and connections live in Settings,
            so neither needs permanent chrome here. */}
        <DragRegion draggable={false} flex={1} />

        {collapsed ? null : (
          <View
            style={{ pointerEvents: 'none' }}
            position="absolute"
            left={0}
            bottom={0}
            width={railWidth}
            height={1}
            backgroundColor="$ink"
          />
        )}
        <View
          style={{ pointerEvents: 'none' }}
          position="absolute"
          left={collapsed ? 0 : railWidth}
          right={0}
          bottom={0}
          height={1}
          backgroundColor="$neutral200"
        />
      </View>
    </DragRegion>
  );
}
