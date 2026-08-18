import { describe, expect, it } from 'bun:test';
import { describeInstagramLoginPage, resolveInstagramBrowserPath } from './instagram-login';

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

describe('describeInstagramLoginPage', () => {
  const page = { url: 'https://www.instagram.com/accounts/login/', title: 'Instagram', text: '' };

  it('identifies a verification interstitial without exposing page contents', () => {
    expect(describeInstagramLoginPage({ ...page, text: 'Please verify your identity to continue' }))
      .toContain('additional verification');
  });

  it('identifies a temporary block', () => {
    expect(describeInstagramLoginPage({ ...page, text: 'Please wait a few minutes before you try again.' }))
      .toContain('temporarily blocked');
  });

  it('uses a safe generic explanation for unknown login pages', () => {
    expect(describeInstagramLoginPage(page)).toBe(
      'Instagram did not return a usable sign-in form to the server. Use the browser-cookie connection option instead.'
    );
  });
});
