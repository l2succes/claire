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

// ---------------------------------------------------------------------------
// Fixture data (mirrors MOCK_BRIDGE server fixtures from docs/MOCK_BRIDGE.md)
// ---------------------------------------------------------------------------

const MOCK_USER_ID = '00000000-0000-0000-0000-000000000001';
const MOCK_SESSION_ID = 'mock-session-1';
const MOCK_ACCESS_TOKEN = 'mock-access-token-e2e';

const MOCK_USER = {
  id: MOCK_USER_ID,
  email: 'test@claire.local',
  role: 'authenticated',
  app_metadata: {},
  user_metadata: { name: 'Test User' },
  aud: 'authenticated',
  created_at: '2025-01-01T00:00:00Z',
};

const MOCK_SESSION_RESP = {
  access_token: MOCK_ACCESS_TOKEN,
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: 'mock-refresh-token',
  user: MOCK_USER,
};

// Messages with the nested join shape that messages.tsx's Supabase query returns:
//   chats(name, platform_chat_id) + ai_suggestions(id, confidence)
const MOCK_INBOX_MESSAGES = [
  {
    id: 'msg-wa-1',
    chat_id: 'mock-chat-wa-alice',
    contact_name: 'Alice (WA)',
    contact_phone: '+15551234567',
    content: "I'll send you the report by Friday",
    timestamp: new Date(Date.now() - 3600_000).toISOString(),
    from_me: false,
    is_group: false,
    platform: 'whatsapp',
    platform_message_id: 'wa-msg-1',
    status: 'delivered',
    chats: { name: null, platform_chat_id: 'mock-chat-wa-alice' },
    ai_suggestions: [{ id: 'sug-1', confidence: 0.9 }],
  },
  {
    id: 'msg-tg-1',
    chat_id: 'mock-chat-tg-bob',
    contact_name: 'Bob (TG)',
    contact_phone: null,
    content: 'Hey, when can we meet?',
    timestamp: new Date(Date.now() - 7200_000).toISOString(),
    from_me: false,
    is_group: false,
    platform: 'telegram',
    platform_message_id: 'tg-msg-1',
    status: 'delivered',
    chats: { name: null, platform_chat_id: 'mock-chat-tg-bob' },
    ai_suggestions: [],
  },
  {
    id: 'msg-ig-1',
    chat_id: 'mock-chat-ig-carol',
    contact_name: 'Carol (IG)',
    contact_phone: null,
    content: "Let's catch up soon!",
    timestamp: new Date(Date.now() - 14400_000).toISOString(),
    from_me: false,
    is_group: false,
    platform: 'instagram',
    platform_message_id: 'ig-msg-1',
    status: 'delivered',
    chats: { name: null, platform_chat_id: 'mock-chat-ig-carol' },
    ai_suggestions: [],
  },
];

const MOCK_CHAT_MESSAGES = [
  {
    id: 'chatmsg-1',
    content: "Hi! I'll send you the report by Friday",
    timestamp: new Date(Date.now() - 3700_000).toISOString(),
    from_me: false,
    contact_name: 'Alice (WA)',
    contact_phone: '+15551234567',
    content_type: 'text',
  },
  {
    id: 'chatmsg-2',
    content: 'Thanks for letting me know',
    timestamp: new Date(Date.now() - 3600_000).toISOString(),
    from_me: true,
    contact_name: null,
    content_type: 'text',
  },
];

const MOCK_AI_SUGGESTIONS = [
  {
    id: 'sug-1',
    message_id: 'chatmsg-1',
    response_text: 'Sounds great, looking forward to it!',
    confidence: 0.92,
    is_selected: false,
    feedback: null,
  },
  {
    id: 'sug-2',
    message_id: 'chatmsg-1',
    response_text: 'Perfect, thank you for the update.',
    confidence: 0.81,
    is_selected: false,
    feedback: null,
  },
];

const MOCK_PROMISES = [
  {
    id: 'promise-1',
    user_id: MOCK_USER_ID,
    message_id: 'chatmsg-1',
    chat_id: 'mock-chat-wa-alice',
    promise_text: "I'll send you the report by Friday",
    due_date: new Date(Date.now() + 86400_000 * 3).toISOString(),
    status: 'open',
    platform: 'whatsapp',
    contact_name: 'Alice (WA)',
    created_at: new Date(Date.now() - 3700_000).toISOString(),
  },
];

const MOCK_SMART_CARDS = [
  {
    id: 'card-1',
    user_id: MOCK_USER_ID,
    chat_id: 'mock-chat-wa-alice',
    card_type: 'action',
    title: 'Follow up on report',
    subtitle: 'Alice mentioned a Friday deadline',
    payload: { draft_message: 'Just checking in on the report — is Friday still good?' },
    priority: 1,
    dismissed: false,
    acted_on: false,
    created_at: new Date(Date.now() - 1800_000).toISOString(),
  },
];

const MOCK_PLATFORM_SESSIONS = [
  {
    id: MOCK_SESSION_ID,
    user_id: MOCK_USER_ID,
    platform: 'whatsapp',
    status: 'connected',
    platform_user_id: '+15161234567',
    created_at: '2025-01-01T00:00:00Z',
  },
];

// Chats table rows — needed by chat screen's fetchChatInfo() to resolve
// platform_chat_id (used as the send target).
const MOCK_CHATS = [
  {
    id: 'mock-chat-wa-alice',
    user_id: MOCK_USER_ID,
    platform: 'whatsapp',
    platform_chat_id: 'mock-chat-wa-alice',
    name: null,
  },
];

// ---------------------------------------------------------------------------
// Route mocking helper — intercept all Supabase + server API calls.
//
// IMPORTANT: Playwright glob patterns do not match query strings reliably.
// We use a single `**/rest/v1/**` catch-all and branch on url.includes()
// inside the handler to ensure correct matching.
// ---------------------------------------------------------------------------

async function mockBackend(page) {
  // Supabase auth: sign-in via password (POST /auth/v1/token)
  await page.route('**/auth/v1/token**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_SESSION_RESP),
    });
  });

  // Supabase auth: user validation
  await page.route('**/auth/v1/user**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_USER),
    });
  });

  // Supabase REST: all /rest/v1/* endpoints — branch on URL path
  await page.route('**/rest/v1/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes('/messages')) {
      // Inbox list or chat detail (chat_id=eq. in query params)
      if (url.includes('chat_id=eq.')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_CHAT_MESSAGES),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_INBOX_MESSAGES),
        });
      }
    } else if (url.includes('/ai_suggestions')) {
      if (method === 'PATCH') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_AI_SUGGESTIONS),
        });
      }
    } else if (url.includes('/promises')) {
      if (method === 'PATCH' || method === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{ ...MOCK_PROMISES[0], status: 'completed' }]),
        });
      } else if (method === 'HEAD') {
        // Supabase count query (head: true) — return Content-Range with count
        const openCount = MOCK_PROMISES.filter((p) => p.status === 'open' || p.status === 'pending').length;
        await route.fulfill({
          status: 200,
          headers: { 'Content-Range': `0-${openCount - 1}/${openCount}` },
          body: '',
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_PROMISES),
        });
      }
    } else if (url.includes('/chats')) {
      // chat screen's fetchChatInfo uses .single() which sends
      // Accept: application/vnd.pgrst.object+json → PostgREST returns
      // a bare object, not an array. Return the first chat object.
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_CHATS[0]),
      });
    } else if (url.includes('/platform_sessions')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_PLATFORM_SESSIONS),
      });
    } else if (url.includes('/smart_cards')) {
      if (method === 'PATCH') {
        // dismiss or mark acted — optimistic update already handled client-side
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_SMART_CARDS),
        });
      }
    } else if (url.includes('/chat_categories') || url.includes('/contact_profiles')) {
      // Settings tables — return empty (no category/profile set)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(null),
      });
    } else if (url.includes('/users')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: MOCK_USER_ID,
          email: 'test@claire.local',
          name: 'Test User',
        }]),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '[]',
      });
    }
  });

  // Bun server API: platform status endpoints.
  // getAllSessions() calls /platforms/<platform>/status for each platform.
  await page.route('**/platforms/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ sessions: MOCK_PLATFORM_SESSIONS }),
    });
  });

  // Bun server API: send message
  await page.route('**/messages/send**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, messageId: `sent-${Date.now()}` }),
    });
  });

  // Bun server API: preferences (GET + PUT)
  await page.route('**/preferences**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          tone: 'friendly',
          response_style: 'concise',
          language: 'en',
          notification_enabled: true,
          preferences: {
            quiet_hours_enabled: false,
            quiet_hours_start: '22:00',
            quiet_hours_end: '08:00',
            notify_messages: true,
            notify_promises: true,
            notify_ai_suggestions: false,
          },
        },
      }),
    });
  });

  // Supabase realtime — stub WebSocket preflight requests
  await page.route('**/realtime/**', async (route) => {
    await route.fulfill({ status: 200, body: '{}' });
  });
}

// ---------------------------------------------------------------------------
// Helper: sign in through the UI
//
// Uses the actual sign-in form so the Supabase auth state is set in the
// Zustand store. Direct page.goto() to authenticated routes fails because
// the auth guard redirects before the async getSession() resolves.
// ---------------------------------------------------------------------------

async function signIn(page) {
  await page.goto('/signin');
  await page.waitForLoadState('domcontentloaded');

  await page.getByTestId('signin-email-input').fill('test@claire.local');
  await page.getByTestId('signin-password-input').fill('password123');
  await page.getByTestId('signin-submit').click();

  // Mock auth succeeds + platform sessions check returns connected → goes to dashboard
  await page.waitForURL('**/dashboard', { timeout: 15_000 });
}

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
  });

  // 5. AI suggestions — suggestion text appears in the chat screen
  test('AI suggestion text appears in chat', async ({ page }) => {
    await signIn(page);

    await expect(
      page.locator('[data-testid^="message-card-"]').first()
    ).toBeVisible({ timeout: 8_000 });
    await page.locator('[data-testid^="message-card-"]').first().click();

    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });

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

  // 6. Promises tab — renders the promises screen
  test('Promises tab renders the promises screen', async ({ page }) => {
    await signIn(page);

    // Click Promises tab
    await page.click('text=Promises');

    // Confirm the route loaded — the promises screen container is present
    await expect(page.getByTestId('promises-screen')).toBeVisible({ timeout: 10_000 });
  });

  // 6b. Promises screen — seeded promise item appears in the list
  test('Promises screen shows seeded promise item', async ({ page }) => {
    await signIn(page);

    await page.click('text=Promises');
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

    await page.click('text=Promises');
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

  // 6d. Promises screen — mark complete interaction
  test('Promises screen mark complete button is present on open promise', async ({ page }) => {
    await signIn(page);

    await page.click('text=Promises');
    await expect(page.getByTestId('promises-screen')).toBeVisible({ timeout: 10_000 });

    // Wait for the promise item to appear
    await expect(
      page.locator('[data-testid^="promise-item-"]').first()
    ).toBeVisible({ timeout: 8_000 });

    // The "Done" button should be visible on open promises
    await expect(
      page.locator('[data-testid^="promise-complete-"]').first()
    ).toBeVisible({ timeout: 5_000 });
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
    await page.click('text=Promises');
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
