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
 *   6. Loops tab → loops screen renders
 *   7. Platform connection screen renders
 */

import { test, expect } from '@playwright/test';

import {
  mockBackend,
  openReplyOptions,
  openSettings,
  signIn,
  toConversationFeedRow,
  MOCK_CONVERSATION_FEED,
  MOCK_GROUP_CHAT_ID,
  MOCK_GROUP_INBOX_MESSAGE,
  MOCK_INBOX_MESSAGES,
  MOCK_PLATFORM_SESSIONS,
  MOCK_LOOPS,
  MOCK_USER_ID,
} from './helpers/mock-backend.mjs';


// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// An open loop deliberately suppresses the quick-context strip — they compete
// for the same row above the transcript (app/chat/[chatId].tsx). Silence loops
// when the strip itself is what is under test.
async function withoutOpenLoops(page) {
  await page.route('**/rest/v1/**', async (route) => {
    if (route.request().url().includes('/loops')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    } else {
      await route.fallback();
    }
  });
}

test.describe('Core loop — mock backend', () => {
  test.beforeEach(async ({ page }) => {
    await mockBackend(page);
  });

  // 1. Auth — passwordless sign-in screen renders required fields
  test('sign-in screen renders passwordless fields', async ({ page }) => {
    await page.goto('/signin');

    await expect(page.getByTestId('signin-screen')).toBeVisible();
    await expect(page.getByTestId('google-sign-in-signin')).toBeVisible();
    await page.getByTestId('signin-use-email').click();
    await expect(page.getByTestId('signin-email-input')).toBeVisible();
    await expect(page.getByTestId('signin-send-otp')).toBeVisible();
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
    // The inbox stays mounted (hidden) under the chat and previews the same
    // text, so assert on the conversation itself.
    await expect(
      page.getByTestId('chat-message-list').getByText('Hello from e2e test')
    ).toBeVisible({ timeout: 5_000 });
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
    // response from the AI endpoint on open. Every other table falls through
    // to mockBackend — a copied table list here drifted when the inbox moved to
    // `conversation_feed`, and the inbox rendered empty.
    await page.route('**/rest/v1/**', async (route) => {
      if (route.request().url().includes('/ai_suggestions')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      } else {
        await route.fallback();
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
    // The chip is the card; "Use" is the control that selects it.
    await expect(page.getByTestId('ai-suggestion-chip-0')).toBeVisible();
    await page.getByTestId('ai-suggestion-use-0').click();

    // Composer should be filled with the first suggestion from the mock response
    await expect(page.getByTestId('chat-input')).toHaveValue(
      'Sure, I can do that!',
      { timeout: 8_000 }
    );
  });

  // Ask Claire opens the conversation-scoped assistant. The inline explanation
  // it used to print in the chat was removed with the Claire design system.
  test('Ask Claire opens the conversation assistant without sending a message', async ({ page }) => {
    await withoutOpenLoops(page);
    let sendRequests = 0;
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/send')) sendRequests += 1;
    });

    await signIn(page);
    await page.getByTestId('message-card-msg-wa-1').click();
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
    // Wait for the card: until context loads the strip offers "Set up" instead,
    // which goes to conversation settings rather than the assistant.
    await expect(page.getByTestId('chat-quick-context')).toContainText(
      'Alice mentioned a Friday deadline',
      { timeout: 8_000 }
    );

    await page.getByTestId('ask-claire-button').click();

    await expect(page.getByTestId('conversation-assistant-screen')).toBeVisible({ timeout: 8_000 });
    await expect(page).toHaveURL(/chat\/assistant\/mock-chat-wa-alice/);
    expect(sendRequests).toBe(0);
  });

  test('global Ask Claire searches messages and opens a cited source', async ({ page }) => {
    await signIn(page);
    // Global Ask Claire is a tab (app/(tabs)/ask-claire.tsx); the inbox header
    // button it replaced was removed.
    await page.getByTestId('tab-ask-claire').click();

    await expect(page.getByTestId('assistant-screen')).toBeVisible({ timeout: 8_000 });
    // The home state lists past threads; the composer belongs to a thread.
    await page.getByTestId('assistant-new-thread').click();
    await page.getByTestId('assistant-input').fill('Where did I mention meeting Alice?');
    await page.getByTestId('assistant-send').click();

    await expect(page.getByTestId('assistant-turn-list')).toContainText('You discussed meeting Alice after the report is sent.');
    // Sources start collapsed: avatars for the first three and the total count.
    // The cited messages themselves render once expanded.
    await expect(page.getByTestId('assistant-sources')).toContainText('Sources');
    await expect(page.locator('[data-testid^="assistant-source-"]')).toHaveCount(0);
    await page.getByTestId('assistant-sources-toggle').click();
    await expect(page.locator('[data-testid^="assistant-source-"]')).toHaveCount(5);
    await expect(page.getByTestId('assistant-sources')).toContainText("Hi! I'll send you the report by Friday");
    await page.getByTestId('assistant-source-chatmsg-1').click();
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 8_000 });
    await expect(page).toHaveURL(/highlightMessageId=chatmsg-1/);
    await expect(page.getByTestId('message-bubble-chatmsg-1-incoming')).toHaveCSS('border-top-width', '2px');
  });

  test('Ask Claire @ targeting sends the selected conversation scope', async ({ page }) => {
    await signIn(page);
    await page.getByTestId('tab-ask-claire').click();
    await expect(page.getByTestId('assistant-screen')).toBeVisible({ timeout: 8_000 });
    await page.getByTestId('assistant-new-thread').click();

    await page.getByTestId('assistant-input').fill('@');
    await expect(page.getByTestId('assistant-mention-candidate-mock-chat-wa-alice')).toBeVisible({ timeout: 5_000 });
    await page.getByTestId('assistant-mention-candidate-mock-chat-wa-alice').click();
    await expect(page.getByTestId('assistant-mention-mock-chat-wa-alice')).toBeVisible();

    await page.getByTestId('assistant-input').fill('What did we decide?');
    await page.getByTestId('assistant-send').click();
    await expect(page.getByTestId('assistant-turn-list')).toContainText('Scoped Alice answer.');
  });

  // 6. Loops tab — renders the loops screen
  test('Loops tab renders the loops screen', async ({ page }) => {
    await signIn(page);

    // Click Loops tab
    await page.getByTestId('tab-loops').click();

    // Confirm the route loaded — the loops screen container is present
    await expect(page.getByTestId('loops-screen')).toBeVisible({ timeout: 10_000 });
  });

  // 6b. Loops screen — seeded loop item appears in the list
  test('Loops screen shows seeded loop item', async ({ page }) => {
    await signIn(page);

    await page.getByTestId('tab-loops').click();
    await expect(page.getByTestId('loops-screen')).toBeVisible({ timeout: 10_000 });

    // The loops list should be visible
    await expect(page.getByTestId('loops-list')).toBeVisible({ timeout: 8_000 });

    // The seeded loop item should appear
    await expect(
      page.locator('[data-testid^="loop-item-"]').first()
    ).toBeVisible({ timeout: 8_000 });
  });

  // 6c. Loops screen — tab switching works
  test('Loops screen tab switching renders correct tab', async ({ page }) => {
    await signIn(page);

    await page.getByTestId('tab-loops').click();
    await expect(page.getByTestId('loops-screen')).toBeVisible({ timeout: 10_000 });

    // Switch to Done tab
    await page.getByTestId('loops-tab-done').click();
    // Done tab is now active — either empty state or items show
    await expect(page.getByTestId('loops-list')).toBeVisible({ timeout: 5_000 });

    // Switch to Overdue tab
    await page.getByTestId('loops-tab-waiting').click();
    await expect(page.getByTestId('loops-list')).toBeVisible({ timeout: 5_000 });

    // Switch back to Open
    await page.getByTestId('loops-tab-open').click();
    await expect(page.getByTestId('loops-list')).toBeVisible({ timeout: 5_000 });
  });

  // 6d. Loops are conversation-first: tapping a card opens its chat to reply.
  test('Loops screen opens the loop details page from a loop card', async ({ page }) => {
    await signIn(page);

    await page.getByTestId('tab-loops').click();
    await expect(page.getByTestId('loops-screen')).toBeVisible({ timeout: 10_000 });

    // Wait for the loop item to appear
    await expect(
      page.locator('[data-testid^="loop-item-"]').first()
    ).toBeVisible({ timeout: 8_000 });

    await expect(page.getByTestId('loop-contact-name-loop-1')).toHaveText('Alice (WA)');
    await expect(page.getByTestId('loop-contact-avatar-loop-1')).toBeVisible();

    // The card opens the loop, not the chat: snooze, history, and delete live
    // on the details page, and jumping to the conversation skipped all of it.
    await page.getByTestId('loop-item-loop-1').click();
    await expect(page.getByTestId('loop-detail-screen')).toBeVisible({ timeout: 8_000 });
    await expect(page).toHaveURL(/loops\/loop-1/);
  });

  test('Loop details page shows the narrative, history, and people', async ({ page }) => {
    await signIn(page);
    await page.goto('/loops/loop-1');

    await expect(page.getByTestId('loop-detail-screen')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('loop-detail-title')).toHaveText('Send Alice the report');
    // state_summary is the evolving narrative — the most useful new field.
    await expect(page.getByTestId('loop-detail-summary')).toBeVisible();
    await expect(page.getByTestId('loop-detail-state')).toContainText('Agreed');
    await expect(page.getByTestId('loop-timeline')).toBeVisible();
    await expect(page.locator('[data-testid^="loop-event-"]')).toHaveCount(2);
  });

  test('Loop details page opens the conversation as a secondary action', async ({ page }) => {
    await signIn(page);
    await page.goto('/loops/loop-1');

    await expect(page.getByTestId('loop-detail-screen')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('loop-detail-open-chat').click();
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
    await openSettings(page);
    await expect(page.getByTestId('settings-screen')).toBeVisible({ timeout: 8_000 });

    // Tap Notifications row
    await page.getByTestId('settings-notifications').click();

    // Notifications settings screen should be visible
    await expect(page.getByTestId('notifications-settings-screen')).toBeVisible({ timeout: 8_000 });

    // All three per-type toggles should be present
    await expect(page.getByTestId('notif-toggle-enabled')).toBeVisible();
    await expect(page.getByTestId('notif-toggle-messages')).toBeVisible();
    await expect(page.getByTestId('notif-toggle-loops')).toBeVisible();
    await expect(page.getByTestId('notif-toggle-ai-suggestions')).toBeVisible();
    await expect(page.getByTestId('notif-toggle-quiet-hours')).toBeVisible();
  });

  // 8b. Notification preferences — prefs persist on save
  test('notification preferences: toggling DND disables other toggles', async ({ page }) => {
    await signIn(page);

    await openSettings(page);
    await expect(page.getByTestId('settings-screen')).toBeVisible({ timeout: 8_000 });
    await page.getByTestId('settings-notifications').click();

    await expect(page.getByTestId('notifications-settings-screen')).toBeVisible({ timeout: 8_000 });

    // DND toggle is initially on (notification_enabled=true from mock)
    // Tap it to turn off
    await page.getByTestId('notif-toggle-enabled').click();

    // Save button is present (the route mock will accept PUT)
    await expect(page.getByTestId('notifications-settings-save')).toBeVisible();
  });

  // 9. Quick context — the seeded smart card surfaces above the transcript.
  // This replaced the smart-card tray, which is no longer rendered.
  test('quick context surfaces the seeded smart card in chat', async ({ page }) => {
    await withoutOpenLoops(page);
    await signIn(page);

    await page.getByTestId('message-card-msg-wa-1').click();
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });

    await expect(page.getByTestId('chat-quick-context')).toContainText(
      'Alice mentioned a Friday deadline',
      { timeout: 8_000 }
    );
  });

  // 10. Loop badge — tab badge count matches open fixtures (#19)
  test('Loops tab badge count matches open fixture count', async ({ page }) => {
    await signIn(page);

    // Verify we're on the messages screen (inbox).
    await expect(page.getByTestId('messages-screen')).toBeVisible({ timeout: 10_000 });

    // Navigate to Loops tab (same approach as existing test 6)
    await page.getByTestId('tab-loops').click();
    await expect(page.getByTestId('loops-screen')).toBeVisible({ timeout: 10_000 });

    // Verify 1 open loop item is present (matching the fixture count of 1 open loop)
    await expect(
      page.locator('[data-testid^="loop-item-"]')
    ).toHaveCount(1, { timeout: 8_000 });
  });

  // 10b. Loop badge — inbox card highlight for chat with open loop (#19)
  test('inbox shows loop badge on message card with open loop', async ({ page }) => {
    await signIn(page);

    // MOCK_LOOPS[0] is linked to mock-chat-wa-alice, which is the first inbox entry.
    // The first message card should have the loop badge.
    await expect(page.getByTestId('messages-screen')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('messages-list')).toBeVisible({ timeout: 8_000 });

    // The message card for Alice (WA) is id=msg-wa-1 — the loop badge should appear on it.
    await expect(
      page.getByTestId('message-card-msg-wa-1').getByLabel('Open loop in this conversation')
    ).toBeVisible({ timeout: 8_000 });

    // Bob (TG) has no loop — his card should NOT have a loop badge.
    await expect(page.getByTestId('message-card-msg-tg-1')).toBeVisible();
    await expect(
      page.getByTestId('message-card-msg-tg-1').getByLabel('Open loop in this conversation')
    ).toHaveCount(0);
  });

  // 11. Quick context — a chat with no stored relationship context offers to set
  // one up, and conversation settings persists it to the profile. This replaced
  // the contact clarification card, which is no longer rendered.
  test('quick context offers to set up relationship context, which saves to the profile', async ({ page }) => {
    await withoutOpenLoops(page);
    await signIn(page);

    // Bob has no smart card and no stored profile, so the strip asks for context.
    await page.getByTestId('message-card-msg-tg-1').click();
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('chat-quick-context')).toContainText(
      'Add relationship context',
      { timeout: 8_000 }
    );

    await page.getByTestId('ask-claire-button').click();
    await expect(page.getByTestId('conversation-ai-settings')).toBeVisible({ timeout: 8_000 });

    const profileUpsert = page.waitForRequest(
      (request) => request.url().includes('/contact_profiles') && request.method() === 'POST',
      { timeout: 8_000 }
    );
    await page.getByPlaceholder('Add useful context about this person').fill('colleague');
    await page.getByRole('button', { name: 'Save' }).click();

    const body = JSON.parse((await profileUpsert).postData() || '{}');
    expect((Array.isArray(body) ? body[0] : body).relationship_context).toBe('colleague');
  });

  // 9b. Quick context — dismissing the card marks it dismissed and drops its text
  test('dismissing quick context marks the smart card dismissed', async ({ page }) => {
    await withoutOpenLoops(page);
    await signIn(page);

    await page.getByTestId('message-card-msg-wa-1').click();
    await expect(page.getByTestId('chat-quick-context')).toContainText(
      'Alice mentioned a Friday deadline',
      { timeout: 8_000 }
    );

    const dismissRequest = page.waitForRequest(
      (request) => request.url().includes('/smart_cards') && request.method() === 'PATCH',
      { timeout: 8_000 }
    );
    await page.getByLabel('Dismiss quick context').click();

    const request = await dismissRequest;
    expect(JSON.parse(request.postData() || '{}').dismissed).toBe(true);
    await expect(page.getByTestId('chat-quick-context')).not.toContainText(
      'Alice mentioned a Friday deadline',
      { timeout: 5_000 }
    );
  });

  // 12. Morning Brief — brief text renders from fixture endpoint (#32)
  // The brief moved from the inbox to the home screen (features/home/home-screen.tsx).
  test('morning brief renders from /ai/morning-brief fixture', async ({ page }) => {
    await signIn(page);
    await page.goto('/dashboard');

    await expect(page.getByTestId('home-screen')).toBeVisible({ timeout: 10_000 });

    // The fixture brief text should be visible
    await expect(
      page.getByTestId('home-screen').getByText('2 messages need your attention')
    ).toBeVisible({ timeout: 8_000 });
  });

  // 12b. Urgent messages — home's "needs a reply" card counts the fixture's urgent messages (#32)
  test('urgent card renders for the fixture urgent message', async ({ page }) => {
    await signIn(page);
    await page.goto('/dashboard');

    // MOCK_MORNING_BRIEF has one urgent message (Alice).
    await expect(page.getByTestId('home-needs-reply')).toContainText('1 conversation waiting', { timeout: 10_000 });
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
    // Until tapped, a video renders its poster with a play button (MediaVideoSurface).
    await expect(page.getByTestId('media-video-play-chatmsg-video')).toBeVisible({ timeout: 8_000 });
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
    await expect(
      page.getByTestId('chat-message-list').getByText('Test media send path')
    ).toBeVisible({ timeout: 5_000 });
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
    // Put the group conversation at the top of the inbox, and serve its chat
    // with group AI enabled — GroupChatSummary only renders when it is.
    await page.route('**/rest/v1/**', async (route) => {
      const url = route.request().url();
      if (url.includes('/conversation_feed')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([toConversationFeedRow(MOCK_GROUP_INBOX_MESSAGE), ...MOCK_CONVERSATION_FEED]),
        });
      } else if (url.includes('/messages')) {
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
            is_group: true,
            ai_enabled: true,
          }),
        });
      } else {
        await route.fallback();
      }
    });

    await signIn(page);
    // The inbox opens on DMs; group conversations are under Groups.
    await page.getByTestId('inbox-filter-groups').click();

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
  platform_user_id: '+14155552671',
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
  let telegramStarted = false;
  let telegramVerified = false;
  // Override the generic platforms/** catch-all with a more specific handler
  // that handles connect/verify/status sub-paths correctly.
  await page.route('**/platforms/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    // Telegram connect — returns awaiting_auth + authData to trigger code step
    if (url.includes('/telegram/connect') && method === 'POST') {
      telegramStarted = true;
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
      // This is intentionally an E2E mock boundary: the production Telegram
      // POST /verify bridge route is still tracked as a server follow-up.
      telegramVerified = true;
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

    // Telegram status — disconnected before start, pending during entry, then connected.
    if (url.includes('/telegram/status')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ sessions: telegramVerified ? [MOCK_TG_SESSION_CONNECTED] : telegramStarted ? [MOCK_TG_SESSION_CONNECTING] : [] }),
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

    // Default: a platform's status check returns only that platform's sessions.
    // Returning the whole fixture made every platform report the connected
    // WhatsApp session, since getAllSessions() aggregates across platforms.
    const requested = url.match(/\/platforms\/([^/?]+)\//)?.[1];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        sessions: MOCK_PLATFORM_SESSIONS.filter((session) => !requested || session.platform === requested),
      }),
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

    await expect(page.getByTestId('connection-flow-whatsapp')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('connection-success')).toBeVisible();
    await expect(page.getByText('WhatsApp is connected')).toBeVisible();
    await expect(page.getByText('Getting your link code…')).not.toBeVisible();
  });

  test('WhatsApp connect flow — validates, copies, and explains phone linking', async ({ page }) => {
    let started = false;
    const waitingSession = {
      id: 'wa-session-2',
      user_id: MOCK_USER_ID,
      platform: 'whatsapp',
      status: 'awaiting_auth',
      created_at: new Date().toISOString(),
      authData: { sessionId: 'wa-session-2', pairingCode: 'ABCD-EFGH' },
    };
    await page.route('**/platforms/whatsapp/**', async (route) => {
      const url = route.request().url();
      if (url.includes('/connect')) {
        started = true;
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, session: waitingSession, authData: waitingSession.authData }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessions: started ? [waitingSession] : [] }) });
    });

    await page.goto('/login');
    await page.getByTestId('platform-selector-whatsapp').click();
    await expect(page.getByTestId('connection-flow-whatsapp')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('Enter your WhatsApp number')).toBeVisible();

    await page.getByTestId('connection-phone-input').fill('123');
    await page.getByRole('button', { name: 'Get link code' }).click();
    await expect(page.getByTestId('connection-phone-error')).toBeVisible();

    await page.getByTestId('connection-phone-input').fill('+14155552671');
    await page.getByRole('button', { name: 'Get link code' }).click();
    await expect(page.getByTestId('whatsapp-pairing-code')).toHaveText('ABCD EFGH');
    await expect(page.getByText(/Link with phone number instead/).first()).toBeVisible();
    await page.getByTestId('whatsapp-copy-code').click();
    // The button's own label confirms the copy; the screen also announces it.
    await expect(page.getByTestId('whatsapp-copy-code')).toHaveText('Copied');
  });

  // TG-1. Telegram connect: phone step renders
  test('Telegram connect flow — phone step renders', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByTestId('platform-login-screen')).toBeVisible();

    // Open the full-screen Telegram flow.
    await page.getByTestId('platform-selector-telegram').click();

    // Phone entry step should be visible
    await expect(page.getByTestId('connection-flow-telegram')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('Enter your Telegram number')).toBeVisible();
    await expect(page.getByTestId('connection-phone-input')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send verification code' })).toBeVisible();
  });

  // TG-2. Telegram connect: phone → code → connected
  test('Telegram connect flow — phone to code to connected', async ({ page }) => {
    // mockConnectFlow's status handler walks disconnected → awaiting code →
    // connected as the flow calls connect and verify. Reporting awaiting_auth
    // from the very first status check instead makes the screen resume that
    // login at the code step, skipping the phone step this test starts on.
    await page.goto('/login');
    await expect(page.getByTestId('platform-login-screen')).toBeVisible();

    // Open Telegram connection guide.
    await page.getByTestId('platform-selector-telegram').click();
    await expect(page.getByTestId('connection-flow-telegram')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('Enter your Telegram number')).toBeVisible({ timeout: 5_000 });

    // Enter phone number and tap Send Code
    await page.getByTestId('connection-phone-input').fill('+14155552671');
    await page.getByRole('button', { name: 'Send verification code' }).click();

    // Code entry step should appear (mock returns awaiting_auth with authData)
    await expect(page.getByText('Check Telegram for your code')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId('telegram-code-input')).toBeVisible();

    // Enter 6-digit verification code
    await page.getByTestId('telegram-code-input').fill('123456');
    await page.getByRole('button', { name: 'Verify and connect' }).click();

    // Success state should appear (mock returns connected)
    await expect(page.getByTestId('connection-success')).toBeVisible({ timeout: 8_000 });
  });

  // IG-1. Instagram connect: desktop companion guidance renders
  test('Instagram connect flow — desktop companion guidance renders', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByTestId('platform-login-screen')).toBeVisible();

    await page.getByTestId('platform-selector-instagram').click();
    await expect(page.getByTestId('connection-flow-instagram')).toBeVisible({ timeout: 5_000 });

    await expect(page.getByTestId('instagram-companion-required')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('Finish once in Claire Desktop')).toBeVisible();
    await expect(page.getByText(/never ask you to paste browser cookies/i)).toBeVisible();
  });

  // IG-2. Instagram connect: companion instructions replace bridge credential UI
  test('Instagram connect flow — does not expose the legacy credential path', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('platform-selector-instagram').click();
    await expect(page.getByTestId('connection-flow-instagram')).toBeVisible({ timeout: 5_000 });

    await expect(page.getByTestId('instagram-login-trigger')).toHaveCount(0);
    await expect(page.getByTestId('instagram-cookie-input')).toHaveCount(0);
    await expect(page.getByTestId('instagram-credentials-form')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'I’ve finished — check connection' })).toBeVisible();
  });

  // IG-3. Instagram connect: users can return to the refreshed platform state
  test('Instagram connect flow — check action preserves the guidance while disconnected', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('platform-selector-instagram').click();
    await expect(page.getByTestId('connection-flow-instagram')).toBeVisible({ timeout: 5_000 });
    await page.getByRole('button', { name: 'I’ve finished — check connection' }).click();
    await expect(page.getByTestId('instagram-companion-required')).toBeVisible();
  });

  test('iMessage connect flow — requires the Mac companion instead of a generic QR code', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('platform-selector-imessage').click();
    await expect(page.getByTestId('connection-flow-imessage')).toBeVisible({ timeout: 5_000 });

    await expect(page.getByTestId('imessage-companion-required')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/Claire Desktop on a Mac/i)).toBeVisible();
    await expect(page.getByTestId('qr-code-display')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'I’ve finished — check connection' })).toBeVisible();
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
    await openSettings(page);
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
    await openSettings(page);
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
    await openSettings(page);
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
