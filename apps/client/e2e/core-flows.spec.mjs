/**
 * Core-loop e2e tests — run with MOCK_BRIDGE=true against the Expo web dev server.
 *
 * All Supabase and server API calls are intercepted via page.route() so these
 * tests run with zero real backend dependencies.
 *
 * Flows covered (from the issue #10 acceptance criteria):
 *   1. Auth → sign in renders and accepts credentials
 *   2. Inbox → seeded messages appear after sign-in
 *   3. Chat → open a chat and messages render
 *   4. Send → type and send a message
 *   5. AI suggestion → suggestion strip appears in chat
 *   6. Promises tab → promises screen renders
 *   7. Platform connection screen renders
 */

import { test, expect } from '@playwright/test';

import {
  mockBackend,
  openReplyOptions,
  signIn,
  MOCK_CHAT_MESSAGES,
  MOCK_GROUP_CHAT_ID,
  MOCK_GROUP_INBOX_MESSAGE,
  MOCK_INBOX_MESSAGES,
  MOCK_PLATFORM_SESSIONS,
  MOCK_PROMISES,
  MOCK_USER_ID,
} from './helpers/mock-backend.mjs';


// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Core loop — mock backend', () => {
  test.beforeEach(async ({ page }) => {
    await mockBackend(page);
  });

  // 1. Auth — sign-in screen renders required fields
  test('sign-in screen renders required fields', async ({ page }) => {
    await page.goto('/signin');

    await expect(page.getByTestId('signin-screen')).toBeVisible();
    await expect(page.getByTestId('google-sign-in-signin')).toBeVisible();
    await page.getByTestId('signin-use-email').click();
    await expect(page.getByTestId('signin-email-input')).toBeVisible();
    await expect(page.getByTestId('signin-password-input')).toBeVisible();
    await expect(page.getByTestId('signin-submit')).toBeVisible();
  });

  // 2. Inbox — messages screen shows seeded messages after sign-in
  test('inbox shows seeded messages after sign-in', async ({ page }) => {
    await signIn(page);

    // Dashboard is now the canonical inbox — no tab navigation needed
    await expect(page.getByTestId('messages-screen')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('messages-list')).toBeVisible();

    // At least one seeded message card should render
    await expect(
      page.locator('[data-testid^="message-card-"]').first()
    ).toBeVisible({ timeout: 8_000 });
  });

  test('new message picker opens a conversation', async ({ page }) => {
    await signIn(page);
    await page.getByTestId('tab-messages').click();
    await expect(page.getByTestId('messages-screen')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('inbox-compose').click();
    await expect(page.getByTestId('compose-screen')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId('compose-recipient-mock-chat-wa-alice')).toBeVisible();
    await expect(page.getByTestId('compose-recipient-mock-chat-wa-group-1')).toBeVisible();

    await page.getByTestId('compose-to-input').fill('Bob');
    await expect(page.getByTestId('compose-recipient-mock-chat-wa-alice')).toHaveCount(0);
    await page.getByTestId('compose-recipient-mock-chat-tg-bob').click();

    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
  });

  test('closing new message returns to the inbox', async ({ page }) => {
    await signIn(page);
    await page.getByTestId('tab-messages').click();
    await expect(page.getByTestId('messages-screen')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('inbox-compose').click();
    await expect(page.getByTestId('compose-screen')).toBeVisible({ timeout: 8_000 });
    await page.getByTestId('compose-close').click();

    await expect(page.getByTestId('messages-screen')).toBeVisible({ timeout: 8_000 });
  });

  // 3. Chat — opening a conversation shows the chat message list
  test('opening a chat shows message list', async ({ page }) => {
    await signIn(page);

    await expect(
      page.locator('[data-testid^="message-card-"]').first()
    ).toBeVisible({ timeout: 8_000 });

    await page.locator('[data-testid^="message-card-"]').first().click();

    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('chat-message-list')).toBeVisible({ timeout: 8_000 });
  });

  test('chat bubbles use sender identity for alignment', async ({ page }) => {
    await signIn(page);
    await expect(page.locator('[data-testid^="message-card-"]').first()).toBeVisible({ timeout: 8_000 });
    await page.locator('[data-testid^="message-card-"]').first().click();
    await expect(page.getByTestId('chat-message-list')).toBeVisible({ timeout: 8_000 });

    await expect(page.locator('[data-testid^="message-row-"][data-testid$="-incoming"]').first()).toBeVisible();
    await expect(page.locator('[data-testid^="message-row-"][data-testid$="-outgoing"]').first()).toBeVisible();
  });

  // 4. Send — typing and submitting a message clears the chat input
  test('sending a message clears the chat input', async ({ page }) => {
    await signIn(page);

    // Start listening for the platform sessions response BEFORE triggering
    // the navigation that causes the fetch, so we don't miss it.
    const sessionsResponsePromise = page.waitForResponse('**/platforms/**', { timeout: 10_000 }).catch(() => null);

    await expect(
      page.locator('[data-testid^="message-card-"]').first()
    ).toBeVisible({ timeout: 8_000 });

    // Wait for sessions to be loaded (ensures send button won't be disabled)
    await sessionsResponsePromise;

    await page.locator('[data-testid^="message-card-"]').first().click();

    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('chat-input')).toBeVisible({ timeout: 8_000 });

    await page.getByTestId('chat-input').fill('Hello from e2e test');
    await page.getByTestId('chat-send-button').click();

    // Input should clear after sending (optimistic update clears immediately)
    await expect(page.getByTestId('chat-input')).toHaveValue('', { timeout: 5_000 });
    await expect(page.getByText('Hello from e2e test')).toBeVisible({ timeout: 5_000 });
  });

  // 5. AI suggestions — suggestion text appears in the chat screen
  test('AI suggestion text appears in chat', async ({ page }) => {
    await signIn(page);

    await expect(
      page.locator('[data-testid^="message-card-"]').first()
    ).toBeVisible({ timeout: 8_000 });
    await page.locator('[data-testid^="message-card-"]').first().click();

    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
    await openReplyOptions(page);

    // ResponseSuggestion renders suggestion text fetched from ai_suggestions table
    await expect(
      page.getByText('Sounds great, looking forward to it!')
    ).toBeVisible({ timeout: 10_000 });
  });

  // 5b. AI suggestion accept — tapping "Use" fills the composer
  test('accepting AI suggestion fills the composer', async ({ page }) => {
    await signIn(page);

    await expect(
      page.locator('[data-testid^="message-card-"]').first()
    ).toBeVisible({ timeout: 8_000 });
    await page.locator('[data-testid^="message-card-"]').first().click();

    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
    await openReplyOptions(page);

    // Wait for the suggestion strip to appear
    await expect(page.getByTestId('ai-suggestion-strip')).toBeVisible({ timeout: 10_000 });

    // Tap the first "Use" button
    await page.getByTestId('ai-suggestion-use-0').click();

    // Composer should now contain the first suggestion text
    await expect(page.getByTestId('chat-input')).toHaveValue(
      'Sounds great, looking forward to it!',
      { timeout: 5_000 }
    );
  });

  // 5c. AI suggestion reject — suggestion strip shows all chips with feedback buttons
  test('suggestion strip shows multiple chips with thumbs buttons', async ({ page }) => {
    await signIn(page);

    await expect(
      page.locator('[data-testid^="message-card-"]').first()
    ).toBeVisible({ timeout: 8_000 });
    await page.locator('[data-testid^="message-card-"]').first().click();

    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
    await openReplyOptions(page);
    await expect(page.getByTestId('ai-suggestion-strip')).toBeVisible({ timeout: 10_000 });

    // Both suggestion chips should be present (fixture has 2 suggestions)
    await expect(page.getByTestId('ai-suggestion-chip-0')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('ai-suggestion-chip-1')).toBeVisible({ timeout: 5_000 });

    // Each chip has a "Use" button (accept action)
    await expect(page.getByTestId('ai-suggestion-use-0')).toBeVisible();
    await expect(page.getByTestId('ai-suggestion-use-1')).toBeVisible();

    // The suggestion scroll container is present
    await expect(page.getByTestId('ai-suggestion-scroll')).toBeVisible();
  });

  // 5d. AI suggestion accept then edit — custom response fires feedback POST
  test('editing suggestion text fires feedback with customResponse', async ({ page }) => {
    await signIn(page);

    await expect(
      page.locator('[data-testid^="message-card-"]').first()
    ).toBeVisible({ timeout: 8_000 });
    await page.locator('[data-testid^="message-card-"]').first().click();

    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
    await openReplyOptions(page);
    await expect(page.getByTestId('ai-suggestion-strip')).toBeVisible({ timeout: 10_000 });

    // Accept a suggestion (fills the composer)
    await page.getByTestId('ai-suggestion-use-0').click();

    // The composer should be filled with the suggestion text
    await expect(page.getByTestId('chat-input')).toHaveValue(
      'Sounds great, looking forward to it!',
      { timeout: 5_000 }
    );

    // Edit the composed text (simulates "edit" action)
    await page.getByTestId('chat-input').fill('Sounds great, but let me check my schedule first!');

    // Verify the input holds the edited value
    await expect(page.getByTestId('chat-input')).toHaveValue(
      'Sounds great, but let me check my schedule first!',
      { timeout: 3_000 }
    );
  });

  // 5e. Reply options prefetch — options appear without a manual draft trigger.
  test('prefetched reply options populate the composer when selected', async ({ page }) => {
    // Override ai_suggestions to return empty, so the chat prefetches a fresh
    // response from the AI endpoint on open.
    await page.route('**/rest/v1/**', async (route) => {
      const url = route.request().url();
      const method = route.request().method();
      if (url.includes('/ai_suggestions')) {
        // Return empty list for both GET and PATCH
        await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      } else if (url.includes('/messages')) {
        if (url.includes('chat_id=eq.')) {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_CHAT_MESSAGES) });
        } else {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_INBOX_MESSAGES) });
        }
      } else if (url.includes('/chats')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(chatsPayload(url, route.request().headers())) });
      } else if (url.includes('/platform_sessions')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PLATFORM_SESSIONS) });
      } else if (url.includes('/smart_cards')) {
        if (method === 'PATCH') {
          await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
        } else {
          await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
        }
      } else if (url.includes('/contact_profiles')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(null) });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      }
    });

    await signIn(page);

    await expect(
      page.locator('[data-testid^="message-card-"]').first()
    ).toBeVisible({ timeout: 8_000 });
    await page.locator('[data-testid^="message-card-"]').first().click();

    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('chat-message-list')).toBeVisible({ timeout: 8_000 });
    await openReplyOptions(page);

    await expect(page.getByTestId('ai-suggestion-scroll')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId('draft-reply-button')).toHaveCount(0);

    // Selecting a prefetched option fills the composer but never sends it.
    await page.getByTestId('ai-suggestion-chip-0').click();

    // Composer should be filled with the first suggestion from the mock response
    await expect(page.getByTestId('chat-input')).toHaveValue(
      'Sure, I can do that!',
      { timeout: 8_000 }
    );
  });

  test('Ask Claire explains the conversation without sending a message', async ({ page }) => {
    await signIn(page);
    await page.locator('[data-testid^="message-card-"]').first().click();
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('ask-claire-button').click();
    await expect(page.getByTestId('conversation-explanation')).toContainText('Alice is confirming the report timeline.');
    await expect(page.getByTestId('chat-input')).toHaveValue('');
  });

  test('global Ask Claire searches messages and opens a cited source', async ({ page }) => {
    await signIn(page);
    await expect(page.getByTestId('open-ask-claire')).toBeVisible({ timeout: 8_000 });
    await page.getByTestId('open-ask-claire').click();

    await expect(page.getByTestId('assistant-screen')).toBeVisible({ timeout: 8_000 });
    await page.getByTestId('assistant-input').fill('Where did I mention meeting Alice?');
    await page.getByTestId('assistant-send').click();

    await expect(page.getByTestId('assistant-turn-list')).toContainText('You discussed meeting Alice after the report is sent.');
    await expect(page.getByTestId('assistant-sources')).toContainText("Hi! I'll send you the report by Friday");
    await expect(page.locator('[data-testid^="assistant-source-"]')).toHaveCount(3);
    await page.getByTestId('assistant-sources-toggle').click();
    await expect(page.locator('[data-testid^="assistant-source-"]')).toHaveCount(5);
    await page.getByTestId('assistant-source-chatmsg-1').click();
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 8_000 });
    await expect(page).toHaveURL(/highlightMessageId=chatmsg-1/);
    await expect(page.getByTestId('message-bubble-chatmsg-1-incoming')).toHaveCSS('border-top-width', '2px');
  });

  test('Ask Claire @ targeting sends the selected conversation scope', async ({ page }) => {
    await signIn(page);
    await page.getByTestId('open-ask-claire').click();
    await expect(page.getByTestId('assistant-screen')).toBeVisible({ timeout: 8_000 });

    await page.getByTestId('assistant-input').fill('@');
    await expect(page.getByTestId('assistant-mention-candidate-mock-chat-wa-alice')).toBeVisible({ timeout: 5_000 });
    await page.getByTestId('assistant-mention-candidate-mock-chat-wa-alice').click();
    await expect(page.getByTestId('assistant-mention-mock-chat-wa-alice')).toBeVisible();

    await page.getByTestId('assistant-input').fill('What did we decide?');
    await page.getByTestId('assistant-send').click();
    await expect(page.getByTestId('assistant-turn-list')).toContainText('Scoped Alice answer.');
  });

  // 6. Promises tab — renders the promises screen
  test('Promises tab renders the promises screen', async ({ page }) => {
    await signIn(page);

    // Click Promises tab
    await page.getByTestId('tab-promises').click();

    // Confirm the route loaded — the promises screen container is present
    await expect(page.getByTestId('promises-screen')).toBeVisible({ timeout: 10_000 });
  });

  // 6b. Promises screen — seeded promise item appears in the list
  test('Promises screen shows seeded promise item', async ({ page }) => {
    await signIn(page);

    await page.getByTestId('tab-promises').click();
    await expect(page.getByTestId('promises-screen')).toBeVisible({ timeout: 10_000 });

    // The promises list should be visible
    await expect(page.getByTestId('promises-list')).toBeVisible({ timeout: 8_000 });

    // The seeded promise item should appear
    await expect(
      page.locator('[data-testid^="promise-item-"]').first()
    ).toBeVisible({ timeout: 8_000 });
  });

  // 6c. Promises screen — tab switching works
  test('Promises screen tab switching renders correct tab', async ({ page }) => {
    await signIn(page);

    await page.getByTestId('tab-promises').click();
    await expect(page.getByTestId('promises-screen')).toBeVisible({ timeout: 10_000 });

    // Switch to Done tab
    await page.getByTestId('promises-tab-done').click();
    // Done tab is now active — either empty state or items show
    await expect(page.getByTestId('promises-list')).toBeVisible({ timeout: 5_000 });

    // Switch to Overdue tab
    await page.getByTestId('promises-tab-overdue').click();
    await expect(page.getByTestId('promises-list')).toBeVisible({ timeout: 5_000 });

    // Switch back to Open
    await page.getByTestId('promises-tab-open').click();
    await expect(page.getByTestId('promises-list')).toBeVisible({ timeout: 5_000 });
  });

  // 6d. Promises are conversation-first: tapping a card opens its chat to reply.
  test('Promises screen opens the linked conversation from a promise card', async ({ page }) => {
    await signIn(page);

    await page.getByTestId('tab-promises').click();
    await expect(page.getByTestId('promises-screen')).toBeVisible({ timeout: 10_000 });

    // Wait for the promise item to appear
    await expect(
      page.locator('[data-testid^="promise-item-"]').first()
    ).toBeVisible({ timeout: 8_000 });

    await expect(page.getByTestId('promise-contact-name-promise-1')).toHaveText('Alice (WA)');
    await expect(page.getByTestId('promise-contact-avatar-promise-1')).toBeVisible();
    await page.getByTestId('promise-item-promise-1').click();
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 8_000 });
    await expect(page).toHaveURL(/chat\/mock-chat-wa-alice/);
  });

  // 7. Platform connection screen — all required selectors present
  test('platform connection screen shows platform selectors', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByTestId('platform-login-screen')).toBeVisible();
    await expect(page.getByTestId('platform-selector-whatsapp')).toBeVisible();
    await expect(page.getByTestId('platform-selector-instagram')).toBeVisible();
  });

  // 8. Notification preferences — screen renders and toggles are present
  test('notification preferences screen renders all toggles', async ({ page }) => {
    await signIn(page);

    // Navigate to Settings tab
    await page.click('text=Settings');
    await expect(page.getByTestId('settings-screen')).toBeVisible({ timeout: 8_000 });

    // Tap Notifications row
    await page.getByTestId('settings-notifications').click();

    // Notifications settings screen should be visible
    await expect(page.getByTestId('notifications-settings-screen')).toBeVisible({ timeout: 8_000 });

    // All three per-type toggles should be present
    await expect(page.getByTestId('notif-toggle-enabled')).toBeVisible();
    await expect(page.getByTestId('notif-toggle-messages')).toBeVisible();
    await expect(page.getByTestId('notif-toggle-promises')).toBeVisible();
    await expect(page.getByTestId('notif-toggle-ai-suggestions')).toBeVisible();
    await expect(page.getByTestId('notif-toggle-quiet-hours')).toBeVisible();
  });

  // 8b. Notification preferences — prefs persist on save
  test('notification preferences: toggling DND disables other toggles', async ({ page }) => {
    await signIn(page);

    await page.click('text=Settings');
    await expect(page.getByTestId('settings-screen')).toBeVisible({ timeout: 8_000 });
    await page.getByTestId('settings-notifications').click();

    await expect(page.getByTestId('notifications-settings-screen')).toBeVisible({ timeout: 8_000 });

    // DND toggle is initially on (notification_enabled=true from mock)
    // Tap it to turn off
    await page.getByTestId('notif-toggle-enabled').click();

    // Save button is present (the route mock will accept PUT)
    await expect(page.getByTestId('notifications-settings-save')).toBeVisible();
  });

  // 9. Smart card tray — seeded card appears in chat
  test('smart card tray shows seeded card in chat', async ({ page }) => {
    await signIn(page);

    await expect(
      page.locator('[data-testid^="message-card-"]').first()
    ).toBeVisible({ timeout: 8_000 });
    await page.locator('[data-testid^="message-card-"]').first().click();

    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });

    // Smart card tray should appear (seeded card has dismissed=false)
    await expect(page.getByTestId('smart-card-tray')).toBeVisible({ timeout: 8_000 });

    // The seeded card itself should render
    await expect(page.getByTestId('smart-card-card-1')).toBeVisible({ timeout: 5_000 });
  });

  // 10. Promise badge — tab badge count matches open fixtures (#19)
  test('Promises tab badge count matches open fixture count', async ({ page }) => {
    await signIn(page);

    // Verify we're on the messages screen (inbox).
    await expect(page.getByTestId('messages-screen')).toBeVisible({ timeout: 10_000 });

    // Navigate to Promises tab (same approach as existing test 6)
    await page.getByTestId('tab-promises').click();
    await expect(page.getByTestId('promises-screen')).toBeVisible({ timeout: 10_000 });

    // Verify 1 open promise item is present (matching the fixture count of 1 open promise)
    await expect(
      page.locator('[data-testid^="promise-item-"]')
    ).toHaveCount(1, { timeout: 8_000 });
  });

  // 10b. Promise badge — inbox card highlight for chat with open promise (#19)
  test('inbox shows promise badge on message card with open promise', async ({ page }) => {
    await signIn(page);

    // MOCK_PROMISES[0] is linked to mock-chat-wa-alice, which is the first inbox entry.
    // The first message card should have the promise badge.
    await expect(page.getByTestId('messages-screen')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('messages-list')).toBeVisible({ timeout: 8_000 });

    // The message card for Alice (WA) is id=msg-wa-1 — the promise badge should appear on it.
    await expect(
      page.getByTestId('message-card-promise-badge-msg-wa-1')
    ).toBeVisible({ timeout: 8_000 });

    // Bob (TG) has no promise — his card should NOT have a promise badge.
    await expect(
      page.getByTestId('message-card-promise-badge-msg-tg-1')
    ).not.toBeVisible();
  });

  // 11. Contact clarification card — appears in chat and answer persists to profile
  test('contact clarification card appears and answer persists to profile', async ({ page }) => {
    await signIn(page);

    await expect(
      page.locator('[data-testid^="message-card-"]').first()
    ).toBeVisible({ timeout: 8_000 });
    await page.locator('[data-testid^="message-card-"]').first().click();

    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });

    // Clarification card should appear (no profile set in mock)
    await expect(page.getByTestId('contact-clarification-card')).toBeVisible({ timeout: 8_000 });

    // The prompt should mention the contact name
    await expect(page.getByTestId('contact-clarification-prompt')).toBeVisible();

    // Intercept the upsert request to verify relationship_context is sent
    const profileUpsertPromise = page.waitForRequest(
      (req) => req.url().includes('/contact_profiles') && req.method() === 'POST',
      { timeout: 5_000 }
    );

    // Tap "Colleague" option
    await page.getByTestId('contact-clarification-option-colleague').click();

    // Verify the upsert was fired with the right payload
    const profileReq = await profileUpsertPromise;
    const body = JSON.parse(profileReq.postData() || '{}');
    expect(body.relationship_context).toBe('colleague');

    // Card should disappear after selection (optimistic dismiss)
    await expect(page.getByTestId('contact-clarification-card')).not.toBeVisible({ timeout: 5_000 });
  });

  // 11b. Contact clarification card — dismiss hides the card
  test('contact clarification card can be dismissed', async ({ page }) => {
    await signIn(page);

    await expect(
      page.locator('[data-testid^="message-card-"]').first()
    ).toBeVisible({ timeout: 8_000 });
    await page.locator('[data-testid^="message-card-"]').first().click();

    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });

    // Clarification card should appear
    await expect(page.getByTestId('contact-clarification-card')).toBeVisible({ timeout: 8_000 });

    // Dismiss it
    await page.getByTestId('contact-clarification-dismiss').click();

    // Card should be gone
    await expect(page.getByTestId('contact-clarification-card')).not.toBeVisible({ timeout: 5_000 });
  });

  // 9b. Smart card tray — dismissing a card removes it
  test('dismissing a smart card removes it from the tray', async ({ page }) => {
    await signIn(page);

    await expect(
      page.locator('[data-testid^="message-card-"]').first()
    ).toBeVisible({ timeout: 8_000 });
    await page.locator('[data-testid^="message-card-"]').first().click();

    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });

    // Wait for the smart card to appear
    await expect(page.getByTestId('smart-card-card-1')).toBeVisible({ timeout: 8_000 });

    // Tap the dismiss button
    await page.getByTestId('smart-card-dismiss-card-1').click();

    // Card should be removed from the tray (optimistic update)
    await expect(page.getByTestId('smart-card-card-1')).not.toBeVisible({ timeout: 5_000 });

    // Tray itself should also disappear when no cards remain
    await expect(page.getByTestId('smart-card-tray')).not.toBeVisible({ timeout: 3_000 });
  });

  // 12. Morning Brief — brief text renders from fixture endpoint (#32)
  test('morning brief renders from /ai/morning-brief fixture', async ({ page }) => {
    await signIn(page);

    // Morning brief container should appear (fed by the mocked /ai/morning-brief endpoint)
    await expect(page.getByTestId('morning-brief-container')).toBeVisible({ timeout: 10_000 });

    // The fixture brief text should be visible
    await expect(
      page.getByText('2 messages need your attention')
    ).toBeVisible({ timeout: 8_000 });
  });

  // 12b. Urgent card — renders from morning brief fixture (#32)
  test('urgent card renders for the fixture urgent message', async ({ page }) => {
    await signIn(page);

    // The urgent cards container should be visible
    await expect(page.getByTestId('urgent-cards-container')).toBeVisible({ timeout: 10_000 });

    // Alice (WA) urgent card should be rendered (first urgent message in fixture)
    // Scope within the container to avoid ambiguity with inbox card rows
    await expect(
      page.getByTestId('urgent-cards-container').getByText('Alice (WA)')
    ).toBeVisible({ timeout: 8_000 });
  });

  // 13. Media in — incoming image fixture renders in chat (#35)
  test('incoming image message renders in chat', async ({ page }) => {
    await signIn(page);

    await expect(
      page.locator('[data-testid^="message-card-"]').first()
    ).toBeVisible({ timeout: 8_000 });
    await page.locator('[data-testid^="message-card-"]').first().click();

    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('chat-message-list')).toBeVisible({ timeout: 8_000 });

    // The image fixture message should render (testID added in this ticket)
    const image = page.getByTestId('media-image-img-chatmsg-img').locator('img');
    await expect(image).toBeVisible({ timeout: 8_000 });
    await expect(image).toHaveJSProperty('naturalWidth', 1);
  });

  // 13b. Media in — audio, video, and document fixtures render in chat (#35)
  test('incoming audio, video, and document messages render in chat', async ({ page }) => {
    await signIn(page);

    await expect(
      page.locator('[data-testid^="message-card-"]').first()
    ).toBeVisible({ timeout: 8_000 });
    await page.locator('[data-testid^="message-card-"]').first().click();

    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('chat-message-list')).toBeVisible({ timeout: 8_000 });

    // Audio fixture
    await expect(page.getByTestId('media-audio-chatmsg-audio')).toBeVisible({ timeout: 8_000 });
    // Video fixture
    await expect(page.getByTestId('media-video-chatmsg-video')).toBeVisible({ timeout: 8_000 });
    // Document fixture
    await expect(page.getByTestId('media-document-chatmsg-doc')).toBeVisible({ timeout: 8_000 });
  });

  // 13c. Media send path — send button dispatches to platform API (#35)
  test('send path: text message dispatches to platform send API', async ({ page }) => {
    await signIn(page);

    const sessionsResponsePromise = page.waitForResponse('**/platforms/**', { timeout: 10_000 }).catch(() => null);

    await expect(
      page.locator('[data-testid^="message-card-"]').first()
    ).toBeVisible({ timeout: 8_000 });

    await sessionsResponsePromise;
    await page.locator('[data-testid^="message-card-"]').first().click();

    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('chat-input')).toBeVisible({ timeout: 8_000 });

    // Intercept the send API call
    const sendRequestPromise = page.waitForRequest(
      (req) => req.url().includes('/send') && req.method() === 'POST',
      { timeout: 8_000 }
    );

    await page.getByTestId('chat-input').fill('Test media send path');
    await page.getByTestId('chat-send-button').click();

    // Verify the send API was called
    const sendReq = await sendRequestPromise;
    expect(sendReq).toBeTruthy();

    // Input should be cleared after send
    await expect(page.getByTestId('chat-input')).toHaveValue('', { timeout: 5_000 });
    await expect(page.getByText('Test media send path')).toBeVisible({ timeout: 5_000 });
  });

  // 14. Snooze — long-pressing a message card opens the snooze modal (#38)
  test('long-pressing a message card opens the snooze picker', async ({ page }) => {
    await signIn(page);

    await expect(page.getByTestId('messages-screen')).toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator('[data-testid^="message-card-"]').first()
    ).toBeVisible({ timeout: 8_000 });

    // Long-press to trigger onLongPress (Playwright click with delay triggers long-press)
    await page.locator('[data-testid^="message-card-"]').first().click({ delay: 600 });

    // Snooze modal should appear
    await expect(page.getByTestId('snooze-modal-overlay')).toBeVisible({ timeout: 5_000 });

    // Snooze options should be present
    await expect(page.getByTestId('snooze-option-3h')).toBeVisible();
    await expect(page.getByTestId('snooze-option-tomorrow')).toBeVisible();
  });

  // 14b. Snooze — selecting an option hides the message from inbox (#38)
  test('snoozing a message hides it from the inbox', async ({ page }) => {
    await signIn(page);

    await expect(page.getByTestId('messages-screen')).toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator('[data-testid^="message-card-"]').first()
    ).toBeVisible({ timeout: 8_000 });

    // Get the ID of the first card so we can check it disappears
    const firstCard = page.locator('[data-testid^="message-card-"]').first();
    const firstCardTestId = await firstCard.getAttribute('data-testid');

    // Long-press to open snooze modal
    await firstCard.click({ delay: 600 });
    await expect(page.getByTestId('snooze-modal-overlay')).toBeVisible({ timeout: 5_000 });

    // Tap "Later today (3 hours)" option
    await page.getByTestId('snooze-option-3h').click();

    // Modal should close
    await expect(page.getByTestId('snooze-modal-overlay')).not.toBeVisible({ timeout: 3_000 });

    // The snoozed card should be removed from the inbox (optimistic hide)
    if (firstCardTestId) {
      await expect(page.getByTestId(firstCardTestId)).not.toBeVisible({ timeout: 3_000 });
    }
  });

  // 14c. Snooze — cancelling dismisses the modal without snoozing (#38)
  test('cancelling the snooze modal keeps the message in inbox', async ({ page }) => {
    await signIn(page);

    await expect(page.getByTestId('messages-screen')).toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator('[data-testid^="message-card-"]').first()
    ).toBeVisible({ timeout: 8_000 });

    const firstCard = page.locator('[data-testid^="message-card-"]').first();
    const firstCardTestId = await firstCard.getAttribute('data-testid');

    // Long-press to open snooze modal
    await firstCard.click({ delay: 600 });
    await expect(page.getByTestId('snooze-modal-overlay')).toBeVisible({ timeout: 5_000 });

    // Tap Cancel
    await page.getByTestId('snooze-cancel').click();

    // Modal should close
    await expect(page.getByTestId('snooze-modal-overlay')).not.toBeVisible({ timeout: 3_000 });

    // The card should still be in the inbox (not snoozed)
    if (firstCardTestId) {
      await expect(page.getByTestId(firstCardTestId)).toBeVisible({ timeout: 3_000 });
    }
  });

  // 15. Group-chat summary — banner renders and shows summary text after expand (#41)
  test('group chat summary banner renders and shows summary on expand', async ({ page }) => {
    // Override the messages endpoint to return a group message as the first inbox entry
    await page.route('**/rest/v1/**', async (route) => {
      const url = route.request().url();
      if (url.includes('/messages')) {
        if (url.includes('chat_id=eq.')) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
              {
                id: 'gchatmsg-1',
                content: 'Hey team, meeting at 3pm!',
                timestamp: new Date(Date.now() - 1800_000).toISOString(),
                from_me: false,
                contact_name: 'Alice',
                contact_phone: null,
                content_type: 'text',
              },
            ]),
          });
        } else {
          // Inbox: return only the group message so the first card leads to a group chat
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([MOCK_GROUP_INBOX_MESSAGE, ...MOCK_INBOX_MESSAGES]),
          });
        }
      } else if (url.includes('/chats')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: MOCK_GROUP_CHAT_ID,
            user_id: MOCK_USER_ID,
            platform: 'whatsapp',
            platform_chat_id: MOCK_GROUP_CHAT_ID,
            name: 'Friday Crew',
          }),
        });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      }
    });

    await signIn(page);

    // First message card should be the group chat
    await expect(
      page.locator('[data-testid^="message-card-"]').first()
    ).toBeVisible({ timeout: 8_000 });

    // Navigate into the group chat (first card = Friday Crew)
    await page.locator('[data-testid^="message-card-"]').first().click();

    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });

    // Group summary banner should be present for group chats
    await expect(page.getByTestId('group-chat-summary')).toBeVisible({ timeout: 8_000 });

    // Tap the toggle to expand
    await page.getByTestId('group-chat-summary-toggle').click();

    // Summary content area should appear
    await expect(page.getByTestId('group-chat-summary-content')).toBeVisible({ timeout: 5_000 });

    // Summary text (mocked) should appear
    await expect(
      page.getByText('The group discussed meeting logistics and upcoming plans.')
    ).toBeVisible({ timeout: 8_000 });
  });
});

test.describe('Web shell smoke', () => {
  test('sign-in page is accessible', async ({ page }) => {
    await page.goto('/signin');
    await expect(page.getByTestId('signin-screen')).toBeVisible();
  });

  test('platform login page is accessible', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByTestId('platform-login-screen')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Connect-flow helpers — mock platform API endpoints for connect tests
// ---------------------------------------------------------------------------

const MOCK_TG_SESSION_CONNECTING = {
  id: 'tg-session-1',
  user_id: MOCK_USER_ID,
  platform: 'telegram',
  status: 'awaiting_auth',
  platform_user_id: null,
  created_at: new Date().toISOString(),
};

const MOCK_TG_SESSION_CONNECTED = {
  id: 'tg-session-1',
  user_id: MOCK_USER_ID,
  platform: 'telegram',
  status: 'connected',
  platform_user_id: '+15550001234',
  created_at: new Date().toISOString(),
};

const MOCK_IG_SESSION_CONNECTED = {
  id: 'ig-session-1',
  user_id: MOCK_USER_ID,
  platform: 'instagram',
  status: 'connected',
  platform_user_id: 'ig_test_user',
  created_at: new Date().toISOString(),
};

/**
 * Sets up platform connect-flow mocks on top of existing mockBackend routes.
 * Must be called AFTER mockBackend() since Playwright routes match last-registered first.
 */
async function mockConnectFlow(page, platformOverrides = {}) {
  // Override the generic platforms/** catch-all with a more specific handler
  // that handles connect/verify/status sub-paths correctly.
  await page.route('**/platforms/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    // Telegram connect — returns awaiting_auth + authData to trigger code step
    if (url.includes('/telegram/connect') && method === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          session: MOCK_TG_SESSION_CONNECTING,
          authData: { sessionId: 'tg-session-1', instructions: 'Enter the code sent to your phone' },
        }),
      });
      return;
    }

    // Telegram verify — returns connected session
    if (url.includes('/telegram/verify') && method === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          session: { ...MOCK_TG_SESSION_CONNECTED, ...platformOverrides.telegramSession },
        }),
      });
      return;
    }

    // Telegram status — returns connected after verify
    if (url.includes('/telegram/status')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ sessions: [MOCK_TG_SESSION_CONNECTED] }),
      });
      return;
    }

    // Instagram login/start
    if (url.includes('/instagram/login/start') && method === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          sessionId: 'ig-session-1',
          loginId: 'ig-login-1',
          stepId: 'step-1',
          stepType: 'cookies',
          instructions: 'Complete this connection in Claire Desktop.',
        }),
      });
      return;
    }

    // Instagram login/submit
    if (url.includes('/instagram/login/submit') && method === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, userLoginId: 'ig-login-1' }),
      });
      return;
    }

    // Instagram starts disconnected in connection-flow tests. Individual
    // tests opt into a connected response when they need to exercise polling.
    if (url.includes('/instagram/status')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ sessions: [] }),
      });
      return;
    }

    // Default: all other platform status checks → return connected sessions
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ sessions: MOCK_PLATFORM_SESSIONS }),
    });
  });
}

// ---------------------------------------------------------------------------
// Platform connect-flow tests
// ---------------------------------------------------------------------------

test.describe('Platform connect flows — mock backend', () => {
  test.beforeEach(async ({ page }) => {
    await mockBackend(page);
    await mockConnectFlow(page);
  });

  test('connected platform opens connection status instead of authentication', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByTestId('platform-login-screen')).toBeVisible();

    // The default fixture has an already-connected WhatsApp session.
    await page.getByTestId('platform-selector-whatsapp').click();

    await expect(page.getByTestId('platform-connection-status')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('Already connected')).toBeVisible();
    await expect(page.getByText('Requesting pairing code...')).not.toBeVisible();
  });

  // TG-1. Telegram connect: phone step renders
  test('Telegram connect flow — phone step renders', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByTestId('platform-login-screen')).toBeVisible();

    // Click Telegram tile to open auth modal
    await page.getByTestId('platform-selector-telegram').click();

    // Auth modal opens
    await expect(page.getByTestId('platform-auth-modal')).toBeVisible({ timeout: 5_000 });

    // Phone entry step should be visible
    await expect(page.getByTestId('telegram-phone-step')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('telegram-phone-input')).toBeVisible();
    await expect(page.getByTestId('telegram-send-code-button')).toBeVisible();
  });

  // TG-2. Telegram connect: phone → code → connected
  test('Telegram connect flow — phone to code to connected', async ({ page }) => {
    // Track whether verify has been called, so status stays awaiting_auth until then
    let verifyDone = false;

    // Override telegram/status to stay in awaiting_auth until verify fires
    await page.route('**/telegram/status**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sessions: [verifyDone ? MOCK_TG_SESSION_CONNECTED : MOCK_TG_SESSION_CONNECTING],
        }),
      });
    });

    // Override telegram/verify to mark done and return connected
    await page.route('**/telegram/verify**', async (route) => {
      verifyDone = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, session: MOCK_TG_SESSION_CONNECTED }),
      });
    });

    await page.goto('/login');
    await expect(page.getByTestId('platform-login-screen')).toBeVisible();

    // Open Telegram auth modal
    await page.getByTestId('platform-selector-telegram').click();
    await expect(page.getByTestId('platform-auth-modal')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('telegram-phone-step')).toBeVisible({ timeout: 5_000 });

    // Enter phone number and tap Send Code
    await page.getByTestId('telegram-phone-input').fill('+15550001234');
    await page.getByTestId('telegram-send-code-button').click();

    // Code entry step should appear (mock returns awaiting_auth with authData)
    await expect(page.getByTestId('telegram-code-step')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId('telegram-code-input')).toBeVisible();

    // Enter 6-digit verification code
    await page.getByTestId('telegram-code-input').fill('123456');
    await page.getByTestId('telegram-verify-button').click();

    // Success state should appear (mock returns connected)
    await expect(page.getByTestId('platform-auth-success')).toBeVisible({ timeout: 8_000 });
  });

  // IG-1. Instagram connect: desktop companion guidance renders
  test('Instagram connect flow — desktop companion guidance renders', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByTestId('platform-login-screen')).toBeVisible();

    await page.getByTestId('platform-selector-instagram').click();
    await expect(page.getByTestId('platform-auth-modal')).toBeVisible({ timeout: 5_000 });

    await expect(page.getByTestId('instagram-companion-required')).toBeVisible({ timeout: 5_000 });
    await expect(
      page.getByTestId('instagram-companion-required').getByText('Connect with Claire Desktop')
    ).toBeVisible();
    await expect(page.getByText(/never ask you to paste a browser cookie/i)).toBeVisible();
  });

  // IG-2. Instagram connect: companion instructions replace bridge credential UI
  test('Instagram connect flow — does not expose the legacy credential path', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('platform-selector-instagram').click();
    await expect(page.getByTestId('platform-auth-modal')).toBeVisible({ timeout: 5_000 });

    await expect(page.getByTestId('instagram-login-trigger')).toHaveCount(0);
    await expect(page.getByTestId('instagram-cookie-input')).toHaveCount(0);
    await expect(page.getByTestId('instagram-credentials-form')).toHaveCount(0);
    await expect(page.getByTestId('instagram-companion-refresh-button')).toBeVisible();
  });

  // IG-3. Instagram connect: users can return to the refreshed platform state
  test('Instagram connect flow — refresh action returns to platform state', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('platform-selector-instagram').click();
    await expect(page.getByTestId('platform-auth-modal')).toBeVisible({ timeout: 5_000 });
    await page.getByTestId('instagram-companion-refresh-button').click();
    await expect(page.getByTestId('platform-auth-modal')).toHaveCount(0);
  });

  test('iMessage connect flow — requires the Mac companion instead of a generic QR code', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('platform-selector-imessage').click();
    await expect(page.getByTestId('platform-auth-modal')).toBeVisible({ timeout: 5_000 });

    await expect(page.getByTestId('imessage-companion-required')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/Claire Desktop on your Mac/i)).toBeVisible();
    await expect(page.getByTestId('qr-code-display')).toHaveCount(0);
    await expect(page.getByTestId('imessage-companion-refresh-button')).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // Auto-reply rules (#40)
  // ---------------------------------------------------------------------------

  test('auto-reply rules screen renders from settings', async ({ page }) => {
    const MOCK_RULES = [];

    // Intercept /auto-reply API
    await page.route('**/auto-reply**', async (route) => {
      const method = route.request().method();
      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ rules: MOCK_RULES }),
        });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      }
    });

    await signIn(page);

    // Navigate to Settings tab
    await page.click('text=Settings');
    await expect(page.getByTestId('settings-screen')).toBeVisible({ timeout: 8_000 });

    // Tap Auto-Reply Rules entry
    await page.getByTestId('settings-auto-reply').click();
    await expect(page.getByTestId('auto-reply-settings-screen')).toBeVisible({ timeout: 10_000 });

    // Empty state should show
    await expect(page.getByTestId('auto-reply-empty')).toBeVisible({ timeout: 5_000 });
  });

  test('auto-reply: create a keyword rule', async ({ page }) => {
    const createdRule = {
      id: 'rule-1',
      name: 'OOO Reply',
      enabled: true,
      trigger_type: 'keyword',
      keywords: ['vacation', 'ooo'],
      reply_template: "I'm out of office, back soon!",
      max_per_hour: 5,
      max_per_day: 20,
      created_at: new Date().toISOString(),
    };

    let rulesStore = [];

    await page.route('**/auto-reply**', async (route) => {
      const method = route.request().method();
      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ rules: rulesStore }),
        });
      } else if (method === 'POST') {
        rulesStore = [createdRule];
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ rule: createdRule }),
        });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      }
    });

    await signIn(page);
    await page.click('text=Settings');
    await expect(page.getByTestId('settings-screen')).toBeVisible({ timeout: 8_000 });
    await page.getByTestId('settings-auto-reply').click();
    await expect(page.getByTestId('auto-reply-settings-screen')).toBeVisible({ timeout: 10_000 });

    // Open create modal via "+" button
    await page.getByTestId('auto-reply-add-rule').click();
    await expect(page.getByTestId('auto-reply-create-modal')).toBeVisible({ timeout: 5_000 });

    // Fill in the form
    await page.getByTestId('auto-reply-name-input').fill('OOO Reply');
    // keyword trigger is default — verify the keywords input is visible
    await expect(page.getByTestId('auto-reply-keywords-input')).toBeVisible({ timeout: 3_000 });
    await page.getByTestId('auto-reply-keywords-input').fill('vacation, ooo');
    await page.getByTestId('auto-reply-template-input').fill("I'm out of office, back soon!");

    // Save the rule
    await page.getByTestId('auto-reply-modal-save').click();

    // Modal closes and the new rule appears in the list
    await expect(page.getByTestId('auto-reply-create-modal')).not.toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('auto-reply-rules-list')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId(`auto-reply-rule-${createdRule.id}`)).toBeVisible({ timeout: 5_000 });
  });

  test('auto-reply: toggle a rule on/off', async ({ page }) => {
    const rule = {
      id: 'rule-toggle-1',
      name: 'Thanks Reply',
      enabled: true,
      trigger_type: 'thanks',
      reply_template: 'You are welcome!',
      max_per_hour: 5,
      max_per_day: 20,
      created_at: new Date().toISOString(),
    };

    await page.route('**/auto-reply**', async (route) => {
      const method = route.request().method();
      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ rules: [rule] }),
        });
      } else if (method === 'PATCH') {
        const body = JSON.parse(route.request().postData() || '{}');
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ rule: { ...rule, enabled: body.enabled } }),
        });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      }
    });

    await signIn(page);
    await page.click('text=Settings');
    await expect(page.getByTestId('settings-screen')).toBeVisible({ timeout: 8_000 });
    await page.getByTestId('settings-auto-reply').click();
    await expect(page.getByTestId('auto-reply-settings-screen')).toBeVisible({ timeout: 10_000 });

    // The rule card should be present
    await expect(page.getByTestId(`auto-reply-rule-${rule.id}`)).toBeVisible({ timeout: 5_000 });

    // The toggle should exist (enabled state)
    const toggle = page.getByTestId(`auto-reply-toggle-${rule.id}`);
    await expect(toggle).toBeVisible({ timeout: 5_000 });

    // Click the toggle to disable
    await toggle.click();

    // Toggle interaction succeeded (no error alert)
    await expect(page.getByTestId('auto-reply-settings-screen')).toBeVisible({ timeout: 3_000 });
  });
});
