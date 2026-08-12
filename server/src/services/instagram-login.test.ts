import { describe, expect, it } from 'bun:test';
import { resolveInstagramBrowserPath } from './instagram-login';

describe('resolveInstagramBrowserPath', () => {
  it('uses an explicit Chrome path before all fallbacks', () => {
    expect(resolveInstagramBrowserPath({ CHROME_PATH: '/custom/chrome' }, 'linux'))
      .toBe('/custom/chrome');
  });

  it('uses the Docker Puppeteer Chromium path on Railway', () => {
    expect(resolveInstagramBrowserPath({ PUPPETEER_EXECUTABLE_PATH: '/usr/bin/chromium' }, 'linux'))
      .toBe('/usr/bin/chromium');
  });

  it('uses the correct platform fallback when no override is configured', () => {
    expect(resolveInstagramBrowserPath({}, 'linux')).toBe('/usr/bin/chromium');
    expect(resolveInstagramBrowserPath({}, 'darwin'))
      .toBe('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  });
});
