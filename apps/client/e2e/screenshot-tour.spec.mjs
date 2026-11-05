/** Visual screenshots from the same synthetic backend as the core suite. */
import { test, expect } from '@playwright/test';
import { mockBackend, openReplyOptions, openSettings, signIn } from './helpers/mock-backend.mjs';

const SCREENSHOTS_DIR = '/tmp/claire-tour';
test.use({ viewport: { width: 390, height: 844 } });

test.describe('Visual tour', () => {
  test.beforeEach(async ({ page }) => {
    await mockBackend(page);
  });

  test('01 — sign-in screen', async ({ page }) => {
    await page.goto('/signin');
    await expect(page.getByTestId('signin-screen')).toBeVisible();
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/01-signin.png` });
  });

  test('02 — sign-in filled', async ({ page }) => {
    await page.goto('/signin');
    await expect(page.getByTestId('signin-screen')).toBeVisible();
    await page.getByTestId('signin-use-email').click();
    await page.getByTestId('signin-email-input').fill('test@claire.local');
    await page.getByTestId('signin-send-otp').click();
    await page.getByTestId('signin-otp-input').fill('123456');
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/02-signin-filled.png` });
  });

  test('03 — dashboard / inbox', async ({ page }) => {
    await signIn(page);
    await expect(page.getByTestId('messages-screen')).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/03-dashboard.png` });
  });

  test('04 — chat screen', async ({ page }) => {
    await signIn(page);
    await expect(page.locator('[data-testid^="message-card-"]').first()).toBeVisible({ timeout: 8_000 });
    await page.locator('[data-testid^="message-card-"]').first().click();
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/04-chat.png` });
  });

  test('05 — AI suggestion strip', async ({ page }) => {
    await signIn(page);
    await page.locator('[data-testid^="message-card-"]').first().click();
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
    await openReplyOptions(page);
    await expect(page.getByTestId('ai-suggestion-strip')).toBeVisible({ timeout: 8_000 });
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/05-chat-ai-suggestions.png` });
  });

  test('06 — composer filled from suggestion', async ({ page }) => {
    await signIn(page);
    await page.locator('[data-testid^="message-card-"]').first().click();
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
    await openReplyOptions(page);
    await expect(page.getByTestId('ai-suggestion-strip')).toBeVisible({ timeout: 8_000 });
    await page.getByTestId('ai-suggestion-use-0').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/06-chat-composer-filled.png` });
  });

  test('07 — loops screen', async ({ page }) => {
    await signIn(page);
    await expect(page.getByTestId('messages-screen')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('tab-loops').click();
    await expect(page.getByTestId('loops-screen')).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/07-loops.png` });
  });

  test('08 — settings screen', async ({ page }) => {
    await signIn(page);
    await expect(page.getByTestId('messages-screen')).toBeVisible({ timeout: 10_000 });
    await openSettings(page);
    await expect(page.getByTestId('settings-screen')).toBeVisible({ timeout: 8_000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/08-settings.png` });
  });

  test('09 — platform login screen', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByTestId('platform-login-screen')).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/09-platform-login.png` });
  });

  test('10 — telegram connection guide', async ({ page }) => {
    await page.route('**/telegram/connect**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, session: { id: 'tg-1', status: 'awaiting_auth' }, authData: { sessionId: 'tg-1', instructions: 'Enter the code sent to your phone' } }) }));
    await page.goto('/login');
    await expect(page.getByTestId('platform-login-screen')).toBeVisible();
    await page.getByTestId('platform-selector-telegram').click();
    await expect(page.getByTestId('connection-flow-telegram')).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/10-telegram-connection.png` });
  });
});
