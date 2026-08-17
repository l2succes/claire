/**
 * Desktop shell e2e — run with MOCK_BRIDGE=true against the Expo web dev server.
 *
 * The point of these tests is the claim that makes the whole architecture work:
 * the desktop chrome is selected by *viewport size*, not by platform. The same
 * bundle, at the same URL, must show the navigation rail in a wide window and
 * the phone layout in a narrow one — which is what lets one build serve the
 * browser and the Electron desktop app.
 */

import { test, expect } from '@playwright/test';
import { mockBackend, signIn } from './helpers/mock-backend.mjs';

// Matches `breakpoints.expanded` in packages/tokens. Values sit either side of
// it so a change to the token makes these fail loudly rather than silently
// testing the wrong thing.
const EXPANDED = { width: 1400, height: 900 };
const COMPACT = { width: 900, height: 900 };

test.describe('Claire desktop shell', () => {
  test.beforeEach(async ({ page }) => {
    await mockBackend(page);
  });

  test('shows the navigation rail in an expanded window', async ({ page }) => {
    await page.setViewportSize(EXPANDED);
    await signIn(page);

    await expect(page.getByTestId('desktop-navigation-rail')).toBeVisible();
    await expect(page.getByTestId('desktop-search-input')).toBeVisible();
    await expect(page.getByTestId('desktop-nav-inbox')).toBeVisible();
    await expect(page.getByTestId('desktop-nav-promises')).toBeVisible();
  });

  test('hides the desktop chrome in a compact window', async ({ page }) => {
    await page.setViewportSize(COMPACT);
    await signIn(page);

    await expect(page.getByTestId('desktop-navigation-rail')).toHaveCount(0);
  });

  test('swaps shells when the window is resized, without losing the route', async ({ page }) => {
    await page.setViewportSize(EXPANDED);
    await signIn(page);
    await expect(page.getByTestId('desktop-navigation-rail')).toBeVisible();

    const routeBefore = new URL(page.url()).pathname;

    await page.setViewportSize(COMPACT);
    await expect(page.getByTestId('desktop-navigation-rail')).toHaveCount(0);

    await page.setViewportSize(EXPANDED);
    await expect(page.getByTestId('desktop-navigation-rail')).toBeVisible();

    // Chrome is layout, not navigation: crossing the breakpoint must not move
    // the user, or a window resize would silently discard their place.
    expect(new URL(page.url()).pathname).toBe(routeBefore);
  });

  test('rail navigation drives the URL so history keeps working', async ({ page }) => {
    await page.setViewportSize(EXPANDED);
    await signIn(page);

    await page.getByTestId('desktop-nav-promises').click();
    await expect(page).toHaveURL(/promises/);

    await page.goBack();
    await expect(page).not.toHaveURL(/promises/);
  });

  test('the sidebar collapses and the choice survives a reload', async ({ page }) => {
    await page.setViewportSize(EXPANDED);
    await signIn(page);

    await page.getByTestId('desktop-toggle-sidebar').click();
    // Collapsed rail keeps the icons but drops the labels.
    await expect(page.getByTestId('desktop-nav-inbox')).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('desktop-navigation-rail')).toBeVisible();
  });
});
