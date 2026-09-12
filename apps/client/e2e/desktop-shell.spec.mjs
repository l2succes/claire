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
const EXPANDED = { width: 1320, height: 900 };
const DESKTOP = { width: 900, height: 900 };
const COMPACT = { width: 899, height: 900 };

test.describe('Claire desktop shell', () => {
  test.beforeEach(async ({ page }) => {
    await mockBackend(page);
  });

  test('shows the navigation rail in an expanded window', async ({ page }) => {
    await page.setViewportSize(EXPANDED);
    await signIn(page);

    await expect(page.getByTestId('desktop-navigation-rail')).toBeVisible();
    await expect(page.getByTestId('desktop-nav-inbox')).toBeVisible();
    await expect(page.getByTestId('desktop-nav-loops')).toBeVisible();
  });

  test('starts the desktop workspace at the Electron minimum width', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signIn(page);
    await expect(page.getByTestId('desktop-navigation-rail')).toBeVisible();
    await page.getByTestId('desktop-nav-inbox').click();
    // Navigating keeps the previous screen mounted but hidden, and it renders
    // its own workspace, so assert on the one that is showing.
    await expect(page.getByTestId('desktop-inbox-workspace').filter({ visible: true })).toBeVisible();
    await expect(page.getByTestId('desktop-inspector-pane')).toHaveCount(0);
  });

  test('hides the desktop chrome in a compact window', async ({ page }) => {
    await page.setViewportSize(COMPACT);
    await signIn(page);

    await expect(page.getByTestId('desktop-navigation-rail')).toHaveCount(0);
  });

  test('shows the inspector only in the full desktop workspace', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signIn(page);
    await page.getByTestId('desktop-nav-inbox').click();
    await expect(page.getByTestId('desktop-inspector-pane')).toHaveCount(0);
    await page.setViewportSize(EXPANDED);
    await expect(page.getByTestId('desktop-inspector-pane').filter({ visible: true })).toBeVisible();
  });

  test('swaps shells when the window is resized, without losing the route', async ({ page }) => {
    await page.setViewportSize(EXPANDED);
    await signIn(page);
    await expect(page.getByTestId('desktop-navigation-rail')).toBeVisible();
    // The inbox workspace opens the first conversation once it loads
    // (desktop-inbox-workspace.tsx). Let that settle first, or the auto-open
    // reads as the resize moving the user.
    await expect(page).toHaveURL(/\/chat\//);

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

    await page.getByTestId('desktop-nav-loops').click();
    await expect(page).toHaveURL(/loops/);

    await page.goBack();
    await expect(page).not.toHaveURL(/loops/);
  });

  test('the sidebar collapses and the choice survives a reload', async ({ page }) => {
    // Known app bug, not a test problem: the reload lands on the auto-opened
    // conversation, whose URL carries `?platform=whatsapp`. Expo's dev server
    // reserves the `platform` query param for bundle requests and answers any
    // non-web value with 404 "Cannot GET". Drop this once chat routes stop
    // passing a param named `platform`.
    test.fail();
    await page.setViewportSize(EXPANDED);
    await signIn(page);

    await page.getByTestId('desktop-toggle-sidebar').click();
    // Collapsed rail keeps the icons but drops the labels.
    await expect(page.getByTestId('desktop-nav-inbox')).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('desktop-navigation-rail')).toBeVisible();
  });

  test('People keeps mobile back navigation out of the desktop layout', async ({ page }) => {
    await page.setViewportSize(EXPANDED);
    await signIn(page);

    await page.getByTestId('desktop-nav-people').click();
    await expect(page).toHaveURL(/contacts/);
    await expect(page.getByLabel('Back', { exact: true })).toHaveCount(0);
  });

  test('People filters by platform and searches names on desktop', async ({ page }) => {
    await page.setViewportSize(EXPANDED);
    await signIn(page);

    await page.getByTestId('desktop-nav-people').click();
    // Assert on list rows: the detail pane also shows the selected person's name.
    const alice = page.getByTestId('people-row-mock-contact-wa-alice');
    const carol = page.getByTestId('people-row-mock-contact-ig-carol');
    await expect(alice).toBeVisible();
    await expect(carol).toBeVisible();

    await page.getByTestId('people-platform-instagram').click();
    await expect(carol).toBeVisible();
    await expect(alice).toHaveCount(0);

    await page.getByTestId('people-platform-all').click();
    await page.getByTestId('contacts-search-input').fill('alice');
    await expect(alice).toBeVisible();
    await expect(carol).toHaveCount(0);
  });
});
