import React, { useCallback, type ReactNode } from 'react';
import { router, usePathname } from 'expo-router';
import {
  ChatBubbleLeftRightIcon,
  CheckBadgeIcon,
  Cog6ToothIcon,
  HomeIcon,
  SparklesIcon,
  UserGroupIcon,
} from 'react-native-heroicons/outline';
import { useIsDesktopLayout } from '@claire/design-system';
import { useHostNavigation } from '@claire/host';
import { DesktopShell, type DesktopDestination } from '@claire/shell';
import { useAuthStore } from '../../stores/authStore';

/**
 * Chooses the shell.
 *
 * Below the desktop breakpoint this renders nothing of its own and the phone
 * layout (tab bar, stacked screens) shows through unchanged. At or above it,
 * the same routes are wrapped in the desktop chrome. Because the switch is a
 * breakpoint and not a platform check, a resized browser window and the
 * Electron app get the same treatment — which is the point.
 *
 * Signed-out routes never get chrome: a navigation rail behind a sign-in form
 * would offer destinations the user cannot reach.
 */
export function DesktopChrome({ children }: { children: ReactNode }) {
  const isDesktop = useIsDesktopLayout();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const pathname = usePathname();

  // Menu accelerators and notification clicks arrive as router paths, so they
  // work the same whether the chrome is showing or not.
  const navigate = useCallback((target: string) => {
    router.push(target as never);
  }, []);
  useHostNavigation(navigate);

  if (!isDesktop || !isAuthenticated) return <>{children}</>;

  return (
    <DesktopShell
      destinations={DESTINATIONS}
      activeRoute={pathname}
      onNavigate={navigate}
    >
      {children}
    </DesktopShell>
  );
}

const DESTINATIONS: DesktopDestination[] = [
  {
    route: '/(tabs)/dashboard',
    label: 'Home',
    icon: (props) => <HomeIcon {...props} />,
  },
  {
    route: '/(tabs)/messages',
    label: 'Inbox',
    icon: (props) => <ChatBubbleLeftRightIcon {...props} />,
  },
  {
    route: '/(tabs)/loops',
    label: 'Loops',
    icon: (props) => <CheckBadgeIcon {...props} />,
  },
  {
    route: '/(tabs)/ask-claire',
    label: 'Ask Claire',
    icon: (props) => <SparklesIcon {...props} />,
  },
  {
    route: '/(tabs)/contacts',
    label: 'People',
    icon: (props) => <UserGroupIcon {...props} />,
  },
  {
    route: '/settings',
    label: 'Settings',
    icon: (props) => <Cog6ToothIcon {...props} />,
  },
];
