import { useIsDesktopLayout } from '@claire/design-system';
import { DesktopHomeScreen } from '../../features/desktop/desktop-home-screen';
import { HomeScreen } from '../../features/home/home-screen';

export default function DashboardRoute() {
  return useIsDesktopLayout() ? <DesktopHomeScreen /> : <HomeScreen />;
}
