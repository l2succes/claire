import { Redirect, useLocalSearchParams } from 'expo-router';
import { ConnectionFlowScreen } from '../../../features/connections/connection-flow-screen';
import type { ConnectionSource } from '../../../features/connections/connection-platform-config';
import { resolvePlatform } from '../../../types/platform';

export default function ConnectionPlatformRoute() {
  const params = useLocalSearchParams<{ platform?: string; source?: string }>();
  const platform = resolvePlatform(params.platform);
  const source: ConnectionSource = params.source === 'settings' ? 'settings' : 'onboarding';

  if (!platform) {
    return <Redirect href={source === 'settings' ? '/connections' : '/(auth)/login'} />;
  }

  return <ConnectionFlowScreen platform={platform} source={source} />;
}
