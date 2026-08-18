import { test, expect } from '@playwright/test';

test.describe('Claire web shell', () => {
  test('renders sign in screen', async ({ page }) => {
    await page.goto('/signin');

    await expect(page.getByTestId('signin-screen')).toBeVisible();
    await expect(page.getByTestId('google-sign-in-signin')).toBeVisible();
    await page.getByTestId('signin-use-email').click();
    await expect(page.getByTestId('signin-email-input')).toBeVisible();
    await expect(page.getByTestId('signin-send-otp')).toBeVisible();
  });

  test('renders platform connection shell', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByTestId('platform-login-screen')).toBeVisible();
    await expect(page.getByTestId('platform-selector-whatsapp')).toBeVisible();
    await expect(page.getByTestId('platform-selector-instagram')).toBeVisible();
  });
});
