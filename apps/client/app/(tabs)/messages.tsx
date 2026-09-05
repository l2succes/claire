import { useIsDesktopLayout } from '@claire/design-system';
import { InboxScreen } from '../../features/inbox/inbox-screen';
import { DesktopInboxWorkspace } from '../../features/desktop/desktop-inbox-workspace';

export default function MessagesRoute() {
  return useIsDesktopLayout() ? <DesktopInboxWorkspace /> : <InboxScreen />;
}
