import DesktopApp from './src/DesktopApp';
import type { DesktopRuntimeConfig } from './src/native/CompanionBridge';

export default function App({ compactWindow = false, initialConversationId = '', runtimeConfig }: { compactWindow?: boolean; initialConversationId?: string; runtimeConfig?: DesktopRuntimeConfig }) {
  return <DesktopApp compactWindow={compactWindow} initialConversationId={initialConversationId || undefined} runtimeConfig={runtimeConfig} />;
}
