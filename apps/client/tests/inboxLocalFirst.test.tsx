/**
 * The inbox used to hold its network query closed (`enabled: cacheReady`) until
 * SQLite answered, and because the query key is part of that effect's
 * dependencies it re-ran the whole hydrate on every keystroke and every filter
 * tap. These tests pin the behaviour that replaced it.
 */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import { Platform } from '../types/platform';

const mockHydrateMobileCache = jest.fn();
const mockTouchCachedChatFromMessage = jest.fn(async () => undefined);
const mockPatchCachedChat = jest.fn(async () => undefined);

jest.mock('../services/mobile-cache', () => ({
  usesNativeMobileCache: () => true,
  hydrateMobileCache: (...args: unknown[]) => mockHydrateMobileCache(...args),
  cacheTimeline: jest.fn(async () => undefined),
  cachedTimeline: jest.fn(async () => []),
  touchCachedChatFromMessage: (...args: unknown[]) => mockTouchCachedChatFromMessage(...args),
  patchCachedChat: (...args: unknown[]) => mockPatchCachedChat(...args),
}));

const supabaseResult = { data: [] as unknown[], error: null as unknown, pending: false };
jest.mock('../services/supabase', () => {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'not', 'or', 'order', 'limit', 'gt']) {
    builder[method] = jest.fn(() => builder);
  }
  builder.then = (resolve: (value: unknown) => unknown) =>
    (supabaseResult.pending ? new Promise(() => {}) : Promise.resolve(supabaseResult).then(resolve));
  return { supabase: { from: jest.fn(() => builder) } };
});

import { patchInboxChat, patchInboxRealtimeMessage, useInboxMessages } from '../hooks/useInboxMessages';

const USER = 'user-1';

function cachedChat(id: string, at: string) {
  return {
    id,
    name: `Chat ${id}`,
    platform: Platform.WHATSAPP,
    unread_count: 0,
    last_message_at: at,
    latest_message: { id: `m-${id}`, chat_id: id, timestamp: at, content: 'hello', from_me: false },
  };
}

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const makeClient = () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

beforeEach(() => {
  jest.clearAllMocks();
  supabaseResult.data = [];
  supabaseResult.error = null;
  supabaseResult.pending = false;
  mockHydrateMobileCache.mockResolvedValue({ chats: [cachedChat('c1', '2026-09-01T10:00:00.000Z')], loops: [], cursor: 0, preferences: null, lastSyncAt: null, fullHistoryEnabled: false });
});

describe('inbox local-first seeding', () => {
  it('paints cached conversations while the network request is still in flight', async () => {
    // The point of the whole exercise: the feed is on screen before the server
    // has said anything at all.
    supabaseResult.pending = true;
    const client = makeClient();
    const { result } = renderHook(() => useInboxMessages(USER), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    expect(result.current.isCold).toBe(false);
  });

  it('does not seed a filtered or searched feed with the whole cached list', async () => {
    const client = makeClient();
    renderHook(() => useInboxMessages(USER, { filter: 'unread' }), { wrapper: wrapper(client) });
    await new Promise((r) => setTimeout(r, 20));
    expect(mockHydrateMobileCache).not.toHaveBeenCalled();

    renderHook(() => useInboxMessages(USER, { search: 'ada' }), { wrapper: wrapper(client) });
    await new Promise((r) => setTimeout(r, 20));
    expect(mockHydrateMobileCache).not.toHaveBeenCalled();
  });

  it('reports cold only when the cache is empty and the network has not answered', async () => {
    mockHydrateMobileCache.mockResolvedValue({ chats: [], loops: [], cursor: 0, preferences: null, lastSyncAt: null, fullHistoryEnabled: false });
    const client = makeClient();
    const { result } = renderHook(() => useInboxMessages(USER), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.localSettled).toBe(true));
    await waitFor(() => expect(result.current.messages).toHaveLength(0));
  });

  it('keeps the cached remainder on screen when the first server page is smaller', async () => {
    // The server's page is twenty conversations and the cache usually holds
    // more; without the provisional tail the list visibly shrinks the instant
    // the network answers.
    const cached = Array.from({ length: 30 }, (_, index) =>
      cachedChat(`c${index}`, `2026-09-${String((index % 28) + 1).padStart(2, '0')}T10:00:00.000Z`));
    mockHydrateMobileCache.mockResolvedValue({ chats: cached, loops: [], cursor: 0, preferences: null, lastSyncAt: null, fullHistoryEnabled: false });
    supabaseResult.data = Array.from({ length: 21 }, (_, index) => ({
      chat_id: `c${index}`,
      platform: Platform.WHATSAPP,
      chat_name: `Chat c${index}`,
      last_message_id: `m-c${index}`,
      last_message_content: 'from the server',
      last_activity_at: `2026-09-${String((index % 28) + 1).padStart(2, '0')}T10:00:00.000Z`,
      last_message_timestamp: `2026-09-${String((index % 28) + 1).padStart(2, '0')}T10:00:00.000Z`,
      unread_count: 0,
    }));

    const client = makeClient();
    const { result } = renderHook(() => useInboxMessages(USER), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.messages.length).toBeGreaterThanOrEqual(30));
  });
});

describe('inbox realtime write-through', () => {
  it('moves the cached conversation row, not just the query cache', () => {
    const client = makeClient();
    patchInboxRealtimeMessage(client, USER, {
      id: 'm-new',
      chat_id: 'c1',
      content: 'newest',
      timestamp: '2026-09-05T10:00:00.000Z',
      from_me: false,
      is_group: false,
      platform: Platform.WHATSAPP,
    } as never);

    expect(mockTouchCachedChatFromMessage).toHaveBeenCalledWith(USER, expect.objectContaining({ id: 'm-new', chat_id: 'c1' }));
  });

  it('persists an unread change and never writes the fields the row lacks', () => {
    const client = makeClient();
    patchInboxChat(client, USER, { id: 'c1', platform: Platform.WHATSAPP, unread_count: 3, is_pinned: true });

    expect(mockPatchCachedChat).toHaveBeenCalledWith(USER, 'c1', expect.objectContaining({ unread_count: 3, is_pinned: true }));
    const [, , patch] = mockPatchCachedChat.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(patch).not.toHaveProperty('latest_message');
    expect(patch).not.toHaveProperty('contact');
  });
});
