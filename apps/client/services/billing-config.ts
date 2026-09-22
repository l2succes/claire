import type { PlatformOSType } from 'react-native';

export type BillingStoreMode = 'test' | 'platform';

type BillingKeyEnvironment = {
  appIdentifier?: string | null;
  appEnvironment?: string;
  configuredStore?: string;
  isDevelopmentBuild: boolean;
  platform: PlatformOSType | string;
  testKey?: string;
  iosKey?: string;
  androidKey?: string;
};

export function resolveBillingStore({
  appIdentifier,
  appEnvironment,
  configuredStore,
  isDevelopmentBuild,
}: Pick<
  BillingKeyEnvironment,
  'appIdentifier' | 'appEnvironment' | 'configuredStore' | 'isDevelopmentBuild'
>): BillingStoreMode {
  // The native application ID is more trustworthy than a Metro environment
  // file, which can be left on another EAS environment between local runs.
  if (appIdentifier?.endsWith('.dev') || appIdentifier?.endsWith('.staging')) return 'test';
  if (appIdentifier === 'com.claire.app') return 'platform';

  // A Test Store key must never make it into a production purchase flow, even
  // if an environment variable is accidentally copied to the production build.
  if (appEnvironment === 'production') return 'platform';
  if (configuredStore === 'test' || configuredStore === 'platform') return configuredStore;
  return isDevelopmentBuild ? 'test' : 'platform';
}

export function resolveBillingApiKey(environment: BillingKeyEnvironment): string | undefined {
  const store = resolveBillingStore(environment);
  if (store === 'test') return environment.testKey;
  if (environment.platform === 'ios') return environment.iosKey;
  if (environment.platform === 'android') return environment.androidKey;
  return undefined;
}
