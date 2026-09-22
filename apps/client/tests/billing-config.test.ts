import { resolveBillingApiKey, resolveBillingStore } from '../services/billing-config';

describe('billing store configuration', () => {
  it('uses Test Store for a development build by default', () => {
    expect(
      resolveBillingApiKey({
        isDevelopmentBuild: true,
        platform: 'ios',
        testKey: 'test_key',
        iosKey: 'ios_key',
      })
    ).toBe('test_key');
  });

  it('allows a release preview build to explicitly use Test Store', () => {
    expect(
      resolveBillingApiKey({
        appEnvironment: 'staging',
        configuredStore: 'test',
        isDevelopmentBuild: false,
        platform: 'ios',
        testKey: 'test_key',
        iosKey: 'ios_key',
      })
    ).toBe('test_key');
  });

  it('uses the native development app identity when Metro has a stale production env', () => {
    expect(
      resolveBillingApiKey({
        appIdentifier: 'com.claire.app.dev',
        appEnvironment: 'production',
        configuredStore: 'platform',
        isDevelopmentBuild: false,
        platform: 'ios',
        testKey: 'test_key',
        iosKey: 'ios_key',
      })
    ).toBe('test_key');
  });

  it('forces the platform store in production', () => {
    expect(
      resolveBillingApiKey({
        appEnvironment: 'production',
        configuredStore: 'test',
        isDevelopmentBuild: true,
        platform: 'ios',
        testKey: 'test_key',
        iosKey: 'ios_key',
      })
    ).toBe('ios_key');
    expect(
      resolveBillingStore({
        appEnvironment: 'production',
        configuredStore: 'test',
        isDevelopmentBuild: true,
      })
    ).toBe('platform');
  });

  it('never lets the production app identity use Test Store', () => {
    expect(
      resolveBillingApiKey({
        appIdentifier: 'com.claire.app',
        appEnvironment: 'development',
        configuredStore: 'test',
        isDevelopmentBuild: true,
        platform: 'ios',
        testKey: 'test_key',
        iosKey: 'ios_key',
      })
    ).toBe('ios_key');
  });

  it('does not silently fall back to real purchases when a Test Store key is missing', () => {
    expect(
      resolveBillingApiKey({
        appEnvironment: 'staging',
        configuredStore: 'test',
        isDevelopmentBuild: false,
        platform: 'ios',
        iosKey: 'ios_key',
      })
    ).toBeUndefined();
  });
});
