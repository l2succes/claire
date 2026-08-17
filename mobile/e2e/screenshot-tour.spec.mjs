/**
 * Visual tour script — opens the app in a headed browser and captures
 * screenshots at key steps so you can see what each screen looks like.
 * Run with: bunx playwright test e2e/screenshot-tour.mjs --headed
 */

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';

// Reuse the same mock fixtures from core-flows
const MOCK_USER_ID = '00000000-0000-0000-0000-000000000001';
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

const MOCK_INBOX_MESSAGES = [
  {
    id: 'msg-wa-1', chat_id: 'mock-chat-wa-alice', contact_name: 'Alice (WA)',
    content: "I'll send you the report by Friday", timestamp: new Date(Date.now() - 3600_000).toISOString(),
    from_me: false, is_group: false, platform: 'whatsapp', platform_message_id: 'wa-msg-1',
    status: 'delivered', chats: { name: null, platform_chat_id: 'mock-chat-wa-alice' },
    ai_suggestions: [{ id: 'sug-1', confidence: 0.9 }],
  },
  {
    id: 'msg-tg-1', chat_id: 'mock-chat-tg-bob', contact_name: 'Bob (TG)',
    content: 'Hey, when can we meet?', timestamp: new Date(Date.now() - 7200_000).toISOString(),
    from_me: false, is_group: false, platform: 'telegram', platform_message_id: 'tg-msg-1',
    status: 'delivered', chats: { name: null, platform_chat_id: 'mock-chat-tg-bob' },
    ai_suggestions: [],
  },
  {
    id: 'msg-ig-1', chat_id: 'mock-chat-ig-carol', contact_name: 'Carol (IG)',
    content: "Let's catch up soon!", timestamp: new Date(Date.now() - 14400_000).toISOString(),
    from_me: false, is_group: false, platform: 'instagram', platform_message_id: 'ig-msg-1',
    status: 'delivered', chats: { name: null, platform_chat_id: 'mock-chat-ig-carol' },
    ai_suggestions: [],
  },
];

const MOCK_CHAT_MESSAGES = [
  { id: 'chatmsg-1', content: "Hi! I'll send you the report by Friday", timestamp: new Date(Date.now() - 3700_000).toISOString(), from_me: false, contact_name: 'Alice (WA)', content_type: 'text' },
  { id: 'chatmsg-2', content: 'Thanks for letting me know', timestamp: new Date(Date.now() - 3600_000).toISOString(), from_me: true, contact_name: null, content_type: 'text' },
  { id: 'chatmsg-img', content: 'Check out this photo', timestamp: new Date(Date.now() - 3500_000).toISOString(), from_me: false, contact_name: 'Alice (WA)', content_type: 'image', media_url: '/media/claire.local/abc123img', media_mime_type: 'image/jpeg' },
];

const MOCK_AI_SUGGESTIONS = [
  { id: 'sug-1', message_id: 'chatmsg-1', response_text: 'Sounds great, looking forward to it!', confidence: 0.92, is_selected: false, feedback: null },
  { id: 'sug-2', message_id: 'chatmsg-1', response_text: 'Perfect, thank you for the update.', confidence: 0.81, is_selected: false, feedback: null },
];

const MOCK_PROMISES = [
  { id: 'promise-1', user_id: MOCK_USER_ID, message_id: 'chatmsg-1', chat_id: 'mock-chat-wa-alice', promise_text: "I'll send you the report by Friday", due_date: new Date(Date.now() + 86400_000 * 3).toISOString(), status: 'open', platform: 'whatsapp', contact_name: 'Alice (WA)', created_at: new Date(Date.now() - 3700_000).toISOString() },
];

const MOCK_SMART_CARDS = [
  { id: 'card-1', user_id: MOCK_USER_ID, chat_id: 'mock-chat-wa-alice', card_type: 'action', title: 'Follow up on report', subtitle: 'Alice mentioned a Friday deadline', payload: { draft_message: 'Just checking in on the report' }, priority: 1, dismissed: false, acted_on: false, created_at: new Date(Date.now() - 1800_000).toISOString() },
];

const MOCK_CHATS = [{ id: 'mock-chat-wa-alice', user_id: MOCK_USER_ID, platform: 'whatsapp', platform_chat_id: 'mock-chat-wa-alice', name: null }];

const MOCK_PLATFORM_SESSIONS = [{ id: 'mock-session-1', user_id: MOCK_USER_ID, platform: 'whatsapp', status: 'connected', platform_user_id: '+15161234567', created_at: '2025-01-01T00:00:00Z' }];

const MOCK_MORNING_BRIEF = {
  brief_text: '2 messages need your attention — starting with Alice (WA) and Bob (TG).',
  urgent_messages: [{ id: 'msg-wa-1', chat_id: 'mock-chat-wa-alice', contact_name: 'Alice (WA)', chat_name: null, content: "I'll send you the report by Friday", timestamp: new Date(Date.now() - 3600_000).toISOString(), from_me: false, is_group: false, platform: 'whatsapp', urgency_score: 55, quick_replies: [{ text: 'Thanks, sounds good!', tone: 'friendly' }] }],
};

const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

async function mockBackend(page) {
  await page.route('**/auth/v1/token**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_SESSION_RESP) }));
  await page.route('**/auth/v1/user**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_USER) }));
  await page.route('**/rest/v1/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (url.includes('/messages')) {
      if (url.includes('chat_id=eq.')) await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_CHAT_MESSAGES) });
      else await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_INBOX_MESSAGES) });
    } else if (url.includes('/ai_suggestions')) {
      if (method === 'PATCH') await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      else await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_AI_SUGGESTIONS) });
    } else if (url.includes('/promises')) {
      if (method === 'HEAD') await route.fulfill({ status: 200, headers: { 'Content-Range': '0-0/1' }, body: '' });
      else await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PROMISES) });
    } else if (url.includes('/chats')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_CHATS[0]) });
    } else if (url.includes('/platform_sessions')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PLATFORM_SESSIONS) });
    } else if (url.includes('/smart_cards')) {
      if (method === 'PATCH') await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      else await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_SMART_CARDS) });
    } else if (url.includes('/contact_profiles')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
  });
  await page.route('**/platforms/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessions: MOCK_PLATFORM_SESSIONS }) }));
  await page.route('**/messages/send**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) }));
  await page.route('**/messages/*/snooze**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) }));
  await page.route('**/preferences**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { tone: 'friendly', response_style: 'concise', language: 'en', notification_enabled: true, preferences: { quiet_hours_enabled: false, quiet_hours_start: '22:00', quiet_hours_end: '08:00', notify_messages: true, notify_promises: true, notify_ai_suggestions: false } } }) }));
  await page.route('**/ai/morning-brief**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: MOCK_MORNING_BRIEF }) }));
  await page.route('**/ai/group-summary/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**/ai/responses/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) }));
  await page.route('**/realtime/**', r => r.fulfill({ status: 200, body: '{}' }));
  await page.route('**/media/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: TINY_PNG }));
}

const SCREENSHOTS_DIR = '/tmp/claire-tour';

test.use({ viewport: { width: 390, height: 844 } }); // iPhone 14 Pro size

// Helper: sign in and land on dashboard (mirrors core-flows signIn helper)
async function signIn(page) {
  await page.goto('/signin');
  await page.waitForLoadState('domcontentloaded');
  await page.getByTestId('signin-email-input').fill('test@claire.local');
  await page.getByTestId('signin-password-input').fill('password123');
  await page.getByTestId('signin-submit').click();
  await page.waitForURL('**/dashboard', { timeout: 15_000 });

  // `/dashboard` is the home / daily-brief screen; the inbox lives on
  // `/messages`, which is what the tour captures.
  await page.goto('/messages');
  await page.getByTestId('messages-screen').waitFor({ timeout: 15_000 });
}

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
    await page.getByTestId('signin-email-input').fill('test@claire.local');
    await page.getByTestId('signin-password-input').fill('password123');
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
    await expect(page.getByTestId('ai-suggestion-strip')).toBeVisible({ timeout: 8_000 });
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/05-chat-ai-suggestions.png` });
  });

  test('06 — composer filled from suggestion', async ({ page }) => {
    await signIn(page);
    await page.locator('[data-testid^="message-card-"]').first().click();
    await expect(page.getByTestId('ai-suggestion-strip')).toBeVisible({ timeout: 8_000 });
    await page.getByTestId('ai-suggestion-use-0').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/06-chat-composer-filled.png` });
  });

  test('07 — promises screen', async ({ page }) => {
    await signIn(page);
    await expect(page.getByTestId('messages-screen')).toBeVisible({ timeout: 10_000 });
    // Disable pointer-events on the error-toast overlay so tab clicks go through
    await page.evaluate(() => {
      const el = document.getElementById('error-toast');
      if (el) el.style.pointerEvents = 'none';
    });
    await page.click('text=Promises');
    await expect(page.getByTestId('promises-screen')).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/07-promises.png` });
  });

  test('08 — settings screen', async ({ page }) => {
    await signIn(page);
    await expect(page.getByTestId('messages-screen')).toBeVisible({ timeout: 10_000 });
    await page.click('text=Settings');
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

  test('10 — telegram auth modal', async ({ page }) => {
    await page.route('**/telegram/connect**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, session: { id: 'tg-1', status: 'awaiting_auth' }, authData: { sessionId: 'tg-1', instructions: 'Enter the code sent to your phone' } }) }));
    await page.goto('/login');
    await expect(page.getByTestId('platform-login-screen')).toBeVisible();
    await page.getByTestId('platform-selector-telegram').click();
    await expect(page.getByTestId('platform-auth-modal')).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/10-telegram-modal.png` });
  });
});
