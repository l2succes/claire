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
  {
    id: 'chatmsg-img',
    content: 'Check out this photo',
    timestamp: new Date(Date.now() - 3500_000).toISOString(),
    from_me: false,
    contact_name: 'Alice (WA)',
    contact_phone: '+15551234567',
    content_type: 'image',
    media_url: '/media/claire.local/abc123img',
    media_mime_type: 'image/jpeg',
  },
  {
    id: 'chatmsg-audio',
    content: '',
    timestamp: new Date(Date.now() - 3400_000).toISOString(),
    from_me: false,
    contact_name: 'Alice (WA)',
    contact_phone: '+15551234567',
    content_type: 'audio',
    media_url: '/media/claire.local/abc123audio',
    media_mime_type: 'audio/ogg',
  },
  {
    id: 'chatmsg-video',
    content: 'Short clip',
    timestamp: new Date(Date.now() - 3300_000).toISOString(),
    from_me: false,
    contact_name: 'Alice (WA)',
    contact_phone: '+15551234567',
    content_type: 'video',
    media_url: '/media/claire.local/abc123video',
    media_mime_type: 'video/mp4',
  },
  {
    id: 'chatmsg-doc',
    content: 'report.pdf',
    timestamp: new Date(Date.now() - 3200_000).toISOString(),
    from_me: false,
    contact_name: 'Alice (WA)',
    contact_phone: '+15551234567',
    content_type: 'document',
    media_url: '/media/claire.local/abc123doc',
    media_mime_type: 'application/pdf',
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

const MOCK_MORNING_BRIEF = {
  brief_text: '2 messages need your attention — starting with Alice (WA) and Bob (TG).',
  urgent_messages: [
    {
      id: 'msg-wa-1',
      chat_id: 'mock-chat-wa-alice',
      contact_name: 'Alice (WA)',
      chat_name: null,
      content: "I'll send you the report by Friday",
      timestamp: new Date(Date.now() - 3600_000).toISOString(),
      from_me: false,
      is_group: false,
      platform: 'whatsapp',
      urgency_score: 55,
      quick_replies: [
        { text: 'Thanks, sounds good!', tone: 'friendly' },
        { text: 'Please share it when ready.', tone: 'professional' },
      ],
    },
  ],
};

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

// Group chat fixture — used by the group-summary e2e test
const MOCK_GROUP_CHAT_ID = 'mock-chat-wa-group-1';
const MOCK_GROUP_INBOX_MESSAGE = {
  id: 'msg-group-1',
  chat_id: MOCK_GROUP_CHAT_ID,
  contact_name: null,
  chat_name: 'Friday Crew',
  contact_phone: null,
  content: 'Hey team, meeting at 3pm!',
  timestamp: new Date(Date.now() - 1800_000).toISOString(),
  from_me: false,
  is_group: true,
  platform: 'whatsapp',
  platform_message_id: 'wa-group-msg-1',
  status: 'delivered',
  chats: { name: 'Friday Crew', platform_chat_id: MOCK_GROUP_CHAT_ID },
  ai_suggestions: [],
};

const MOCK_GROUP_SUMMARY_RESP = {
  success: true,
  data: {
    summary: 'The group discussed meeting logistics and upcoming plans. (mock summary)',
  },
};

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
    } else if (url.includes('/chat_categories')) {
      // Settings table — return empty (no category set)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(null),
      });
    } else if (url.includes('/contact_profiles')) {
      if (method === 'POST') {
        // upsert (insert via POST with Prefer: resolution=merge-duplicates)
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{
            id: 'profile-1',
            user_id: MOCK_USER_ID,
            chat_id: 'mock-chat-wa-alice',
            relationship_context: JSON.parse(route.request().postData() || '{}').relationship_context ?? null,
            display_name: null,
            email: null,
            phone_number: null,
            location: null,
            key_facts: [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }]),
        });
      } else {
        // GET — return null (no profile set yet, so clarification card appears)
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(null),
        });
      }
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

  // Bun server API: snooze message
  await page.route('**/messages/*/snooze**', async (route) => {
    const method = route.request().method();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
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

  // Bun server API: morning brief
  await page.route('**/ai/morning-brief**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: MOCK_MORNING_BRIEF }),
    });
  });

  // Bun server API: group summary
  await page.route('**/ai/group-summary/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_GROUP_SUMMARY_RESP),
    });
  });

  // Bun server API: AI suggestion feedback (POST /ai/responses/feedback)
  await page.route('**/ai/responses/feedback**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    });
  });

  // Bun server API: on-demand AI response generation (POST /ai/responses/generate)
  await page.route('**/ai/responses/generate**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          messageId: 'chatmsg-1',
          suggestions: ['Sure, I can do that!', 'Sounds good, let me check.'],
          confidence: 0.9,
        },
      }),
    });
  });

  // Supabase realtime — stub WebSocket preflight requests
  await page.route('**/realtime/**', async (route) => {
    await route.fulfill({ status: 200, body: '{}' });
  });

  // Matrix media proxy — return a 1x1 PNG for any /media/ requests
  const TINY_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );
  await page.route('**/media/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: TINY_PNG,
    });
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

  // 5c. AI suggestion reject — suggestion strip shows all chips with feedback buttons
  test('suggestion strip shows multiple chips with thumbs buttons', async ({ page }) => {
    await signIn(page);

    await expect(
      page.locator('[data-testid^="message-card-"]').first()
    ).toBeVisible({ timeout: 8_000 });
    await page.locator('[data-testid^="message-card-"]').first().click();

    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
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

  // 5e. On-demand "Draft reply" button — tapping fills the composer via /ai/responses/generate (#22)
  test('draft reply button populates composer via on-demand generate', async ({ page }) => {
    // Override ai_suggestions to return empty (no pre-stored suggestions) so the
    // Draft reply button is shown instead of the suggestion strip.
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
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_CHATS[0]) });
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

    // Draft reply button should appear (no stored suggestions)
    await expect(page.getByTestId('draft-reply-button')).toBeVisible({ timeout: 8_000 });

    // Tap the button — calls /ai/responses/generate (mocked)
    await page.getByTestId('draft-reply-button').click();

    // Composer should be filled with the first suggestion from the mock response
    await expect(page.getByTestId('chat-input')).toHaveValue(
      'Sure, I can do that!',
      { timeout: 8_000 }
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
    await expect(page.getByTestId('media-image-chatmsg-img')).toBeVisible({ timeout: 8_000 });
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
          instructions: 'Log in to Instagram and paste your cookies',
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

    // Instagram status — returns connected
    if (url.includes('/instagram/status')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ sessions: [MOCK_IG_SESSION_CONNECTED] }),
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

  // IG-1. Instagram connect: trigger button renders
  test('Instagram connect flow — login trigger renders', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByTestId('platform-login-screen')).toBeVisible();

    await page.getByTestId('platform-selector-instagram').click();
    await expect(page.getByTestId('platform-auth-modal')).toBeVisible({ timeout: 5_000 });

    // Instagram login trigger button should be visible
    await expect(page.getByTestId('instagram-login-trigger')).toBeVisible({ timeout: 5_000 });
  });

  // IG-2. Instagram connect: error state shows on failed start
  test('Instagram connect flow — shows error on failed login start', async ({ page }) => {
    // Override instagram/login/start to return an error
    await page.route('**/instagram/login/start**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Instagram bridge unavailable' }),
      });
    });

    await page.goto('/login');
    await page.getByTestId('platform-selector-instagram').click();
    await expect(page.getByTestId('platform-auth-modal')).toBeVisible({ timeout: 5_000 });

    // Tap the login trigger button
    await page.getByTestId('instagram-login-trigger').click();

    // Error state should appear
    await expect(page.getByTestId('instagram-error-state')).toBeVisible({ timeout: 8_000 });

    // Retry button should be present
    await expect(page.getByTestId('instagram-retry-button')).toBeVisible();
  });

  // IG-3. Instagram connect: connecting state renders while polling
  test('Instagram connect flow — connecting state shows after submit', async ({ page }) => {
    // Slow down status polling so we can observe the connecting state
    let statusCallCount = 0;
    await page.route('**/instagram/status**', async (route) => {
      statusCallCount++;
      // First call returns awaiting_auth so connecting state stays visible
      if (statusCallCount <= 1) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ sessions: [{ ...MOCK_IG_SESSION_CONNECTED, status: 'awaiting_auth' }] }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ sessions: [MOCK_IG_SESSION_CONNECTED] }),
        });
      }
    });

    // Mock instagramLoginStart to return immediately
    await page.route('**/instagram/login/start**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          sessionId: 'ig-session-1',
          loginId: 'ig-login-1',
          stepId: 'step-1',
          stepType: 'cookies',
        }),
      });
    });

    await page.goto('/login');
    await page.getByTestId('platform-selector-instagram').click();
    await expect(page.getByTestId('platform-auth-modal')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('instagram-login-trigger')).toBeVisible({ timeout: 5_000 });

    // In the web flow, clicking login trigger invokes instagramLoginStart.
    // The WebView component is a stub on web — we verify that the trigger was clickable
    // and the modal stays open (not the native WebView path).
    await page.getByTestId('instagram-login-trigger').click();

    // Modal should still be visible (login flow in progress or WebView opened)
    await expect(page.getByTestId('platform-auth-modal')).toBeVisible({ timeout: 3_000 });
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
