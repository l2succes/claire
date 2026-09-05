import { describe, expect, it } from 'bun:test';
import { platformCatalog, platformCatalogVersion } from './platform-catalog';

describe('platform catalog', () => {
  it('contains the 16 actively documented user-facing networks', () => {
    expect(platformCatalog).toHaveLength(16);
    expect(new Set(platformCatalog.map((platform) => platform.id)).size).toBe(16);
    expect(platformCatalog.map((platform) => platform.id)).not.toContain('twilio');
    expect(platformCatalog.map((platform) => platform.id)).not.toContain('deltachat');
  });

  it('only advertises the three implemented Claire networks as available', () => {
    expect(
      platformCatalog
        .filter((platform) => platform.supportStatus === 'available')
        .map((platform) => platform.id)
    ).toEqual(['whatsapp', 'telegram', 'instagram']);
  });

  it('gives every network a real, traceable SVG mark with a text fallback', () => {
    for (const platform of platformCatalog) {
      expect(platform.iconUrl).toStartWith('https://');
      expect(platform.iconSourceUrl).toStartWith('https://');
      expect(platform.mark.length).toBeGreaterThan(0);
    }

    expect(platformCatalog.find((platform) => platform.id === 'irc')?.iconTreatment).toBe(
      'generic'
    );
    expect(platformCatalog.filter((platform) => platform.iconTreatment !== 'generic')).toHaveLength(
      15
    );
  });

  it('distinguishes setup-only desktop connections from persistent devices', () => {
    const instagram = platformCatalog.find((platform) => platform.id === 'instagram');
    const imessage = platformCatalog.find((platform) => platform.id === 'imessage');
    const googleMessages = platformCatalog.find((platform) => platform.id === 'google-messages');

    expect(instagram?.capabilities.desktopSetup).toBe(true);
    expect(instagram?.capabilities.persistentDevice).toBe(false);
    expect(imessage?.supportStatus).toBe('beta');
    expect(imessage?.setupLabel).toBe('Set up on this Mac');
    expect(imessage?.deviceDependency).toBe('always_on_mac');
    expect(imessage?.capabilities.cloudRuntime).toBe(false);
    expect(googleMessages?.deviceDependency).toBe('android_phone_online');
  });

  it('matches the generated website snapshot', async () => {
    const generatedSource = await Bun.file(
      new URL('../../website/public/scripts/platform-catalog.js', import.meta.url)
    ).text();
    const json = generatedSource
      .replace(/^.*window\.CLAIRE_PLATFORM_CATALOG = /s, '')
      .replace(/;\s*$/, '');
    const generated = JSON.parse(json);

    expect(generated.version).toBe(platformCatalogVersion);
    expect(generated.platforms).toEqual(platformCatalog);
  });
});
