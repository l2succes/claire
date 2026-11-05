import { test, expect } from '@playwright/test';
import { mockBackend, signIn, MOCK_SESSION_RESP } from './helpers/mock-backend.mjs';

test('global search recovers rejected sessions for matches and the AI answer', async ({ page }) => {
  await mockBackend(page);
  await signIn(page);
  let refreshes = 0;
  const requests = { exact: [], answer: [] };
  await page.route('**/auth/v1/token**', async (route) => {
    refreshes += 1;
    await route.fulfill({ json: { ...MOCK_SESSION_RESP, access_token: 'refreshed-search-token' } });
  });
  await page.route('**/search?**', async (route) => {
    requests.exact.push(route.request().headers().authorization);
    if (requests.exact.length === 1) {
      await route.fulfill({ status: 401, json: { error: 'Invalid token' } });
      return;
    }
    await route.fulfill({ json: { data: {
      query: 'Maya', scope: 'everything', messages: [], loops: [], files: [],
      people: [{ id: 'maya', name: 'Maya Search Result', platform: 'whatsapp' }],
      counts: { messages: 0, people: 1, loops: 0, files: 0 },
    } } });
  });
  await page.route('**/ai/search', async (route) => {
    requests.answer.push(route.request().headers().authorization);
    if (requests.answer.length === 1) {
      await route.fulfill({ status: 401, json: { error: 'Invalid token' } });
      return;
    }
    expect(route.request().postDataJSON()).toEqual({ query: 'Maya' });
    await route.fulfill({ json: { data: { answer: 'Maya confirmed the launch.', citations: [], indexing: { status: 'ready' } } } });
  });

  await page.goto('/search');
  await page.getByTestId('global-search-input').fill('Maya');
  await page.getByTestId('global-search-input').press('Enter');
  await expect(page.getByTestId('search-result-person-maya')).toBeVisible();
  await expect(page.getByTestId('search-results-screen')).toContainText('Maya confirmed the launch.');
  await expect(page.getByTestId('search-results-screen')).not.toContainText('Invalid token');
  expect(requests.exact).toHaveLength(2);
  expect(requests.answer).toHaveLength(2);
  expect(requests.exact[1]).toBe('Bearer refreshed-search-token');
  expect(requests.answer[1]).toBe('Bearer refreshed-search-token');
  expect(refreshes).toBeGreaterThan(0);
});
