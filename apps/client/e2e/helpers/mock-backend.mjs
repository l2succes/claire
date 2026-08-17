/**
 * Shared mock backend for the Expo web e2e suites.
 *
 * All Supabase and server API calls are intercepted via page.route(), so the
 * specs run with zero real backend dependencies. Extracted from
 * core-flows.spec.mjs so the desktop-shell suite mocks the same way rather
 * than growing a second, drifting copy.
 */

// ---------------------------------------------------------------------------
// Fixture data (mirrors MOCK_BRIDGE server fixtures from docs/MOCK_BRIDGE.md)
// ---------------------------------------------------------------------------

export const MOCK_USER_ID = '00000000-0000-0000-0000-000000000001';
export const MOCK_SESSION_ID = 'mock-session-1';
export const MOCK_ACCESS_TOKEN = 'mock-access-token-e2e';

export const MOCK_USER = {
  id: MOCK_USER_ID,
  email: 'test@claire.local',
  role: 'authenticated',
  app_metadata: {},
  user_metadata: { name: 'Test User' },
  aud: 'authenticated',
  created_at: '2025-01-01T00:00:00Z',
};

export const MOCK_SESSION_RESP = {
  access_token: MOCK_ACCESS_TOKEN,
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: 'mock-refresh-token',
  user: MOCK_USER,
};

// Messages with the nested join shape that messages.tsx's Supabase query returns:
//   chats(name, platform_chat_id) + ai_suggestions(id, confidence)
export const MOCK_INBOX_MESSAGES = [
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

export const MOCK_CHAT_MESSAGES = [
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

export const MOCK_AI_SUGGESTIONS = [
  {
    id: 'sug-1',
    message_id: 'chatmsg-1',
    suggestions: ['Sounds great, looking forward to it!'],
    confidence: 0.92,
    selected_index: null,
    feedback: null,
  },
  {
    id: 'sug-2',
    message_id: 'chatmsg-1',
    suggestions: ['Perfect, thank you for the update.'],
    confidence: 0.81,
    selected_index: null,
    feedback: null,
  },
];

export const MOCK_PROMISES = [
  {
    id: 'promise-1',
    user_id: MOCK_USER_ID,
    message_id: 'chatmsg-1',
    chat_id: 'mock-chat-wa-alice',
    promise_text: "I'll send you the report by Friday",
    due_date: new Date(Date.now() + 86400_000 * 3).toISOString(),
    status: 'open',
    platform: 'whatsapp',
    created_at: new Date(Date.now() - 3700_000).toISOString(),
  },
];

// Represents the source-message fallback used for legacy promise rows that
// were stored before chat/contact IDs were captured by the detector.
export const MOCK_PROMISE_SOURCE_MESSAGES = [
  {
    id: 'chatmsg-1',
    chat_id: 'mock-chat-wa-alice',
    contact_name: 'Alice (WA)',
    platform: 'whatsapp',
    contact: {
      name: 'Alice (WA)',
      avatar_url: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
    },
    chat: {
      name: 'Alice (WA)',
      is_group: false,
      platform: 'whatsapp',
    },
  },
];

export const MOCK_SMART_CARDS = [
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

export const MOCK_PLATFORM_SESSIONS = [
  {
    id: MOCK_SESSION_ID,
    user_id: MOCK_USER_ID,
    platform: 'whatsapp',
    status: 'connected',
    platform_user_id: '+15161234567',
    created_at: '2025-01-01T00:00:00Z',
  },
];

export const MOCK_PEOPLE = [
  {
    id: 'mock-contact-wa-alice',
    name: 'Alice',
    phone_number: '+15551234567',
    avatar_url: null,
    inferred_name: null,
    inferred_relationship: 'Colleague',
    is_group: false,
    platform: 'whatsapp',
    username: null,
    chat: { id: 'mock-chat-wa-alice', name: null, platform: 'whatsapp', is_group: false, last_message_at: new Date().toISOString() },
  },
  {
    id: 'mock-contact-ig-carol',
    name: 'Carol',
    phone_number: null,
    avatar_url: null,
    inferred_name: null,
    inferred_relationship: null,
    is_group: false,
    platform: 'instagram',
    username: 'carol',
    chat: { id: 'mock-chat-ig-carol', name: null, platform: 'instagram', is_group: false, last_message_at: new Date().toISOString() },
  },
];

export const MOCK_MORNING_BRIEF = {
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
// platform_chat_id (used as the send target) and by the new-message picker.
export const MOCK_CHATS = [
  {
    id: 'mock-chat-wa-alice',
    user_id: MOCK_USER_ID,
    platform: 'whatsapp',
    platform_chat_id: 'mock-chat-wa-alice',
    name: 'Alice (WA)',
    is_group: false,
    last_message_at: new Date(Date.now() - 3600_000).toISOString(),
  },
  {
    id: 'mock-chat-tg-bob',
    user_id: MOCK_USER_ID,
    platform: 'telegram',
    platform_chat_id: 'mock-chat-tg-bob',
    name: 'Bob (TG)',
    is_group: false,
    last_message_at: new Date(Date.now() - 7200_000).toISOString(),
  },
  {
    id: 'mock-chat-ig-carol',
    user_id: MOCK_USER_ID,
    platform: 'instagram',
    platform_chat_id: 'mock-chat-ig-carol',
    name: 'Carol (IG)',
    is_group: false,
    last_message_at: new Date(Date.now() - 14400_000).toISOString(),
  },
  {
    id: 'mock-chat-wa-group-1',
    user_id: MOCK_USER_ID,
    platform: 'whatsapp',
    platform_chat_id: 'mock-chat-wa-group-1',
    name: 'Friday Crew',
    is_group: true,
    last_message_at: new Date(Date.now() - 1800_000).toISOString(),
  },
];

function chatsPayload(url, headers = {}) {
  const decoded = decodeURIComponent(url);
  const accept = headers.accept || headers.Accept || '';
  const idMatch = decoded.match(/[?&]id=eq\.([^&]+)/);
  const wantsSingle = String(accept).includes('vnd.pgrst.object+json') || Boolean(idMatch);
  if (!wantsSingle) return MOCK_CHATS;
  return MOCK_CHATS.find((chat) => chat.id === idMatch?.[1]) || MOCK_CHATS[0];
}

// Group chat fixture — used by the group-summary e2e test
export const MOCK_GROUP_CHAT_ID = 'mock-chat-wa-group-1';
export const MOCK_GROUP_INBOX_MESSAGE = {
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

export const MOCK_GROUP_SUMMARY_RESP = {
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

export async function mockBackend(page) {
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
      } else if (url.includes('id=in.')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_PROMISE_SOURCE_MESSAGES),
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
      // a bare object, not an array. List queries (new message, people)
      // still need the full set.
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(chatsPayload(url, route.request().headers())),
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
    const url = route.request().url();
    if (route.request().method() === 'POST' && url.includes('/send')) {
      const body = JSON.parse(route.request().postData() || '{}');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: {
            id: `local-${Date.now()}`,
            platformMessageId: `evt-${Date.now()}`,
            content: body.content || '',
            timestamp: new Date().toISOString(),
            isFromMe: true,
          },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ sessions: MOCK_PLATFORM_SESSIONS }),
    });
  });

  // People is a paginated server endpoint rather than an unbounded client
  // Supabase query. Keep the desktop-shell tests representative of that path.
  await page.route('**/contacts**', async (route) => {
    const url = new URL(route.request().url());
    const platform = url.searchParams.get('platform');
    const q = (url.searchParams.get('q') || '').toLowerCase();
    const contacts = MOCK_PEOPLE.filter((contact) =>
      (!platform || platform === 'all' || contact.platform === platform)
      && (!q || [contact.name, contact.phone_number, contact.username].some((value) => value?.toLowerCase().includes(q))),
    );
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { contacts, nextOffset: null } }),
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

  // Bun server API: explain a conversation without drafting or sending
  await page.route('**/ai/conversations/explain**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          summary: 'Alice is confirming the report timeline.',
          latestMessageIntent: 'She intends to send the report by Friday.',
          responseStrategy: 'Acknowledge the deadline and offer help if needed.',
          suggestedNextStep: 'Choose a concise reply option.',
          contextSignals: ['Friday deadline', 'Professional context'],
        },
      }),
    });
  });

  // Bun server API: persisted global Ask Claire conversations and retrieval.
  const assistantThread = {
    id: 'assistant-thread-1',
    title: 'New conversation',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  let assistantThreads = [];
  let assistantTurns = [];
  let assistantScope = [];
  await page.route('**/ai/assistant/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();
    if (path.endsWith('/mention-candidates') && method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [{ id: 'mock-chat-wa-alice', name: 'Alice (WA)', platform: 'whatsapp', is_group: false }] }) });
    } else if (path.endsWith('/index/status')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { status: 'ready', indexedCount: 4, totalCount: 4, lastIndexedAt: new Date().toISOString(), lastError: null } }) });
    } else if (path.endsWith('/index') && method === 'POST') {
      await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ success: true, data: { status: 'indexing', indexedCount: 0, totalCount: 4, lastIndexedAt: null, lastError: null } }) });
    } else if (path.endsWith('/threads') && method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: assistantThreads }) });
    } else if (path.endsWith('/threads') && method === 'POST') {
      assistantThreads = [assistantThread, ...assistantThreads];
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ success: true, data: assistantThread }) });
    } else if (path.endsWith(`/threads/${assistantThread.id}`) && method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { thread: assistantThread, turns: assistantTurns } }) });
    } else if (path.endsWith(`/threads/${assistantThread.id}/messages`) && method === 'POST') {
      assistantScope = JSON.parse(route.request().postData() || '{}').chatIds || [];
      assistantTurns = [
        { id: 'assistant-user-1', role: 'user', content: 'Where did I mention meeting Alice?', citations: [], scope_chat_ids: assistantScope, created_at: new Date().toISOString() },
        { id: 'assistant-answer-1', role: 'assistant', content: 'You discussed meeting Alice after the report is sent.', citations: [], scope_chat_ids: assistantScope, created_at: new Date().toISOString() },
      ];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            answer: assistantScope.includes('mock-chat-wa-alice') ? 'Scoped Alice answer.' : 'You discussed meeting Alice after the report is sent.',
            citations: [
              { messageId: 'chatmsg-1', chatId: 'mock-chat-wa-alice', excerpt: "Hi! I'll send you the report by Friday", senderName: 'Alice (WA)', fromMe: false, timestamp: new Date().toISOString(), platform: 'whatsapp', chatName: 'Alice (WA)', isGroup: false, isPreferredScope: assistantScope.includes('mock-chat-wa-alice') },
              { messageId: 'chatmsg-2', chatId: 'mock-chat-wa-alice', excerpt: 'Thanks for letting me know', senderName: 'You', fromMe: true, timestamp: new Date().toISOString(), platform: 'whatsapp', chatName: 'Alice (WA)', isGroup: false },
              { messageId: 'chatmsg-img', chatId: 'mock-chat-wa-alice', excerpt: 'Check out this photo', senderName: 'Alice (WA)', fromMe: false, timestamp: new Date().toISOString(), platform: 'whatsapp', chatName: 'Alice (WA)', isGroup: false },
              { messageId: 'chatmsg-audio', chatId: 'mock-chat-wa-alice', excerpt: 'Voice message', senderName: 'Alice (WA)', fromMe: false, timestamp: new Date().toISOString(), platform: 'whatsapp', chatName: 'Alice (WA)', isGroup: false },
              { messageId: 'chatmsg-video', chatId: 'mock-chat-wa-alice', excerpt: 'Short clip', senderName: 'Alice (WA)', fromMe: false, timestamp: new Date().toISOString(), platform: 'whatsapp', chatName: 'Alice (WA)', isGroup: false },
            ],
            indexing: { status: 'ready', indexedCount: 4, totalCount: 4, lastIndexedAt: new Date().toISOString(), lastError: null },
          },
        }),
      });
    } else if (path.endsWith(`/threads/${assistantThread.id}`) && method === 'DELETE') {
      assistantThreads = [];
      assistantTurns = [];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    } else {
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: `Unhandled assistant route ${method} ${path}` }) });
    }
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

export async function signIn(page) {
  await page.goto('/signin');
  await page.waitForLoadState('domcontentloaded');
  await page.getByTestId('signin-use-email').click();

  await page.getByTestId('signin-email-input').fill('test@claire.local');
  await page.getByTestId('signin-password-input').fill('password123');
  await page.getByTestId('signin-submit').click();

  // Mock auth succeeds + platform sessions check returns connected → goes to dashboard
  await page.waitForURL('**/dashboard', { timeout: 15_000 });

  // `/dashboard` is the home / daily-brief screen; the inbox lives on
  // `/messages`. Every test below asserts against the inbox, so land there.
  await page.goto('/messages');
  await page.getByTestId('messages-screen').waitFor({ timeout: 15_000 });
}

export async function openReplyOptions(page) {
  await page.getByTestId('chat-composer-add').click();
  await page.getByTestId('composer-action-reply-options').click();
}
