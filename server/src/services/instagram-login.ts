import puppeteer, { Browser, Page } from 'puppeteer';
import crypto from 'crypto';
import { logger } from '../utils/logger';

export interface InstagramCredentialLoginResult {
  status: 'success' | 'two_factor_required' | 'challenge_required' | 'error';
  cookies?: Record<string, string>;
  twoFactorInfo?: { loginId: string; message: string };
  error?: string;
}

interface PendingLogin {
  browser: Browser;
  page: Page;
  username: string;
  expiresAt: number;
  timeout: NodeJS.Timeout;
}

const pendingLogins = new Map<string, PendingLogin>();
const LOGIN_TTL_MS = 5 * 60 * 1000;
const SUCCESS_URL_PATTERN = /^https:\/\/www\.instagram\.com\/(?:direct\/(?:inbox\/|t\/[0-9]+\/)?)?(?:\?.*)?$/;
const USERNAME_SELECTOR = [
  'input[name="username"]',
  'input[autocomplete="username"]',
  'input[aria-label="Phone number, username, or email"]',
].join(', ');
const PASSWORD_SELECTOR = [
  'input[name="password"]',
  'input[autocomplete="current-password"]',
  'input[type="password"]',
].join(', ');

/**
 * Instagram changes its login markup frequently and may show an interstitial
 * to data-centre browsers. Keep the detail in server logs while returning a
 * safe, actionable explanation to the client.
 */
export function describeInstagramLoginPage(page: {
  url: string;
  title: string;
  text: string;
}): string {
  const text = page.text.toLowerCase();
  if (text.includes('challenge') || text.includes('verify your identity') || text.includes('suspicious')) {
    return 'Instagram requires additional verification in your regular browser or app. Complete that verification, then use the browser-cookie connection option.';
  }
  if (text.includes('wait a few minutes') || text.includes('try again later') || text.includes('temporarily blocked')) {
    return 'Instagram temporarily blocked this cloud sign-in attempt. Use the browser-cookie connection option instead of retrying immediately.';
  }
  if (text.includes('cookies') && (text.includes('allow') || text.includes('accept'))) {
    return 'Instagram showed a cookie-consent page instead of its sign-in form. Use the browser-cookie connection option.';
  }
  return 'Instagram did not return a usable sign-in form to the server. Use the browser-cookie connection option instead.';
}

async function inspectLoginPage(page: Page): Promise<{ url: string; title: string; text: string }> {
  // Use a string so the server's Node-only TypeScript compilation does not
  // require DOM globals for code that runs inside Chromium.
  return page.evaluate(`(() => ({
    url: window.location.href,
    title: document.title,
    text: document.body?.innerText?.slice(0, 2000) || '',
  }))()`) as Promise<{ url: string; title: string; text: string }>;
}

async function waitForCredentialFields(page: Page): Promise<void> {
  try {
    await page.waitForFunction(
      `(() => Boolean(
        document.querySelector(${JSON.stringify(USERNAME_SELECTOR)}) &&
        document.querySelector(${JSON.stringify(PASSWORD_SELECTOR)})
      ))()`,
      { timeout: 20_000 },
    );
  } catch {
    const summary = await inspectLoginPage(page);
    const message = describeInstagramLoginPage(summary);
    logger.warn('Instagram credential form unavailable', {
      url: summary.url,
      title: summary.title,
      // Log only a compact classification, never credentials or cookies.
      reason: message,
    });
    throw new Error(message);
  }
}

function generateLoginId(): string {
  return crypto.randomBytes(16).toString('hex');
}

async function cleanupPendingLogin(loginId: string): Promise<void> {
  const pending = pendingLogins.get(loginId);
  if (!pending) return;

  clearTimeout(pending.timeout);
  try {
    await pending.browser.close();
  } catch (err) {
    logger.error(`Failed to close browser for login ${loginId}: ${err}`);
  }
  pendingLogins.delete(loginId);
}

export function resolveInstagramBrowserPath(
  env: NodeJS.ProcessEnv = process.env,
  platform = process.platform,
): string {
  // Railway's production image installs Chromium at /usr/bin/chromium. The
  // previous macOS-only fallback made every web Instagram sign-in fail before
  // it even reached Instagram.
  if (env.CHROME_PATH) return env.CHROME_PATH;
  if (env.PUPPETEER_EXECUTABLE_PATH) return env.PUPPETEER_EXECUTABLE_PATH;
  return platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : '/usr/bin/chromium';
}

async function launchBrowser(): Promise<Browser> {
  const chromePath = resolveInstagramBrowserPath();

  return puppeteer.launch({
    headless: true,
    executablePath: chromePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--disable-extensions',
    ],
  });
}

async function waitForLoginOutcome(page: Page): Promise<{
  outcome: 'success' | 'two_factor' | 'challenge' | 'error';
  message?: string;
}> {
  try {
    const result = await Promise.race([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 })
        .then(() => ({ type: 'navigation' as const, url: page.url() }))
        .catch(() => null),

      page.waitForSelector('input[name="verificationCode"]', { timeout: 15000 })
        .then(() => ({ type: 'two_factor' as const }))
        .catch(() => null),

      page.waitForFunction(
        `(() => { const t = document.body.innerText.toLowerCase(); return t.includes('security code') || t.includes('verification code') || t.includes('two-factor authentication'); })()`,
        { timeout: 15000 }
      ).then(() => ({ type: 'two_factor_text' as const }))
        .catch(() => null),

      page.waitForFunction(
        `window.location.href.includes('/challenge/')`,
        { timeout: 15000 }
      ).then(() => ({ type: 'challenge' as const }))
        .catch(() => null),

      page.waitForFunction(
        `(() => { const t = document.body.innerText.toLowerCase(); return t.includes('suspicious') || t.includes('unusual activity') || t.includes('verify your identity'); })()`,
        { timeout: 15000 }
      ).then(() => ({ type: 'challenge_text' as const }))
        .catch(() => null),

      page.waitForSelector('#slfErrorAlert', { timeout: 15000 })
        .then(() => ({ type: 'error' as const }))
        .catch(() => null),
    ]);

    if (!result) {
      return { outcome: 'error', message: 'Login timeout - no response from Instagram' };
    }

    if (result.type === 'navigation') {
      const url = result.url;
      if (SUCCESS_URL_PATTERN.test(url)) {
        return { outcome: 'success' };
      } else if (url.includes('/challenge/')) {
        return { outcome: 'challenge', message: 'Instagram requires additional verification' };
      } else {
        return { outcome: 'error', message: `Unexpected redirect to: ${url}` };
      }
    }

    if (result.type === 'two_factor' || result.type === 'two_factor_text') {
      return { outcome: 'two_factor', message: 'Two-factor authentication required' };
    }

    if (result.type === 'challenge' || result.type === 'challenge_text') {
      return { outcome: 'challenge', message: 'Instagram requires additional verification' };
    }

    if (result.type === 'error') {
      const errorText = await page.evaluate(`document.querySelector('#slfErrorAlert')?.textContent ?? ''`).catch(() => 'Unknown error') as string;
      return { outcome: 'error', message: errorText.trim() || 'Login failed' };
    }

    return { outcome: 'error', message: 'Unknown login outcome' };

  } catch (err) {
    logger.error(`Error waiting for login outcome: ${err}`);
    return { outcome: 'error', message: err instanceof Error ? err.message : 'Unknown error' };
  }
}

async function extractCookies(page: Page): Promise<Record<string, string>> {
  const cookies = await page.cookies('https://www.instagram.com');
  const cookieMap: Record<string, string> = {};

  const requiredCookies = ['sessionid', 'csrftoken', 'mid', 'ig_did', 'ds_user_id'];

  for (const cookie of cookies) {
    if (requiredCookies.includes(cookie.name)) {
      cookieMap[cookie.name] = cookie.value;
    }
  }

  return cookieMap;
}

export async function loginWithCredentials(
  username: string,
  password: string
): Promise<InstagramCredentialLoginResult> {
  let browser: Browser | null = null;

  try {
    logger.info(`Starting Instagram login for user: ${username}`);

    browser = await launchBrowser();
    const page = await browser.newPage();

    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
    );

    await page.goto('https://www.instagram.com/accounts/login/', {
      // Instagram keeps background requests open, so networkidle2 can turn a
      // perfectly usable page into a false timeout. The explicit field wait
      // below is the readiness signal we actually need.
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    await waitForCredentialFields(page);

    await page.type(USERNAME_SELECTOR, username, { delay: 100 });
    await page.type(PASSWORD_SELECTOR, password, { delay: 100 });

    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 5000 }).catch(() => {}),
    ]);

    const outcome = await waitForLoginOutcome(page);

    if (outcome.outcome === 'success') {
      const cookies = await extractCookies(page);
      await browser.close();

      logger.info(`Instagram login successful for user: ${username}`);
      return {
        status: 'success',
        cookies,
      };
    }

    if (outcome.outcome === 'two_factor') {
      const loginId = generateLoginId();
      const expiresAt = Date.now() + LOGIN_TTL_MS;

      const timeout = setTimeout(() => {
        logger.info(`Login ${loginId} expired, cleaning up`);
        cleanupPendingLogin(loginId);
      }, LOGIN_TTL_MS);

      pendingLogins.set(loginId, {
        browser,
        page,
        username,
        expiresAt,
        timeout,
      });

      logger.info(`Two-factor required for ${username}, login ID: ${loginId}`);
      return {
        status: 'two_factor_required',
        twoFactorInfo: {
          loginId,
          message: outcome.message || 'Enter the 6-digit code from your authenticator app',
        },
      };
    }

    if (outcome.outcome === 'challenge') {
      await browser.close();
      logger.warn(`Instagram challenge required for user: ${username}`);
      return {
        status: 'challenge_required',
        error: outcome.message || 'Instagram requires additional verification. Please try logging in via the Instagram app first.',
      };
    }

    await browser.close();
    logger.error(`Instagram login failed for ${username}: ${outcome.message}`);
    return {
      status: 'error',
      error: outcome.message || 'Login failed',
    };

  } catch (err) {
    if (browser) {
      await browser.close().catch(() => {});
    }

    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    logger.error(`Instagram login error for ${username}: ${errorMessage}`);
    return {
      status: 'error',
      error: errorMessage,
    };
  }
}

export async function submitTwoFactorCode(
  loginId: string,
  code: string
): Promise<InstagramCredentialLoginResult> {
  const pending = pendingLogins.get(loginId);

  if (!pending) {
    return {
      status: 'error',
      error: 'Login session expired or not found. Please start login again.',
    };
  }

  const { page, username } = pending;

  try {
    logger.info(`Submitting 2FA code for login ${loginId} (user: ${username})`);

    await page.waitForSelector('input[name="verificationCode"]', { timeout: 5000 });
    await page.type('input[name="verificationCode"]', code, { delay: 100 });

    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 5000 }).catch(() => {}),
    ]);

    const outcome = await waitForLoginOutcome(page);

    if (outcome.outcome === 'success') {
      const cookies = await extractCookies(page);
      await cleanupPendingLogin(loginId);

      logger.info(`Instagram 2FA login successful for user: ${username}`);
      return {
        status: 'success',
        cookies,
      };
    }

    if (outcome.outcome === 'challenge') {
      await cleanupPendingLogin(loginId);
      logger.warn(`Instagram challenge required after 2FA for user: ${username}`);
      return {
        status: 'challenge_required',
        error: outcome.message || 'Instagram requires additional verification',
      };
    }

    await cleanupPendingLogin(loginId);
    logger.error(`Instagram 2FA failed for ${username}: ${outcome.message}`);
    return {
      status: 'error',
      error: outcome.message || 'Two-factor authentication failed',
    };

  } catch (err) {
    await cleanupPendingLogin(loginId);

    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    logger.error(`Instagram 2FA error for ${username}: ${errorMessage}`);
    return {
      status: 'error',
      error: errorMessage,
    };
  }
}

export async function cleanup(): Promise<void> {
  logger.info(`Cleaning up ${pendingLogins.size} pending Instagram logins`);

  const cleanupPromises = Array.from(pendingLogins.keys()).map(loginId =>
    cleanupPendingLogin(loginId)
  );

  await Promise.allSettled(cleanupPromises);
  logger.info('Instagram login service cleanup complete');
}
