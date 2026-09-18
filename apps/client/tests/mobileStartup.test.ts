/**
 * Cold start used to fire a full bootstrap, up to twenty sync pages, and nine
 * parallel 200-message prefetches the instant a token existed -- all against
 * the same SQLite file the inbox was reading in order to show anything at all.
 */
const mockRequests: string[] = [];
const mockChats: Array<Record<string, unknown>> = [];
let mockMessageCount = 0;

jest.mock('react-native', () => ({
  InteractionManager: { runAfterInteractions: (fn: () => void) => { fn(); return { cancel: () => undefined }; } },
}));

jest.mock('../services/mobile-cache', () => ({
  usesNativeMobileCache: () => true,
  hydrateMobileCache: jest.fn(async () => ({ chats: mockChats, loops: [], cursor: 0, preferences: null, lastSyncAt: null, fullHistoryEnabled: false })),
  cacheBootstrap: jest.fn(async () => undefined),
  cacheTimeline: jest.fn(async () => undefined),
  cachedCursor: jest.fn(async () => 0),
  cachedMessageCount: jest.fn(async () => mockMessageCount),
  applyMobileSyncEvents: jest.fn(async () => undefined),
  oldestCachedMessage: jest.fn(async () => null),
}));

jest.mock('../services/platforms', () => ({ API_BASE_URL: 'http://localhost:3001' }));

global.fetch = jest.fn(async (url: string) => {
  mockRequests.push(String(url));
  const body = String(url).includes('/desktop/bootstrap')
    ? { cursor: 1, chats: [], loops: [], preferences: null }
    : String(url).includes('/desktop/sync')
      ? { events: [], cursor: 1, hasMore: false }
      : { messages: [] };
  return { ok: true, json: async () => body } as unknown as Response;
}) as unknown as typeof fetch;

import { bootstrapMobileCache, resetFirstPaintSignal, signalFirstPaint } from '../services/mobile-sync';

beforeEach(() => {
  mockRequests.length = 0;
  mockChats.length = 0;
  mockMessageCount = 0;
  resetFirstPaintSignal();
});

describe('staged cold start', () => {
  it('waits for the first paint before touching the network when there is a cache to paint', async () => {
    mockChats.push({ id: 'c1', last_message_at: '2026-09-01T10:00:00.000Z' });

    const started = bootstrapMobileCache('user-1', 'token');
    await new Promise((r) => setTimeout(r, 20));
    expect(mockRequests).toHaveLength(0);

    signalFirstPaint();
    await started;
    expect(mockRequests.length).toBeGreaterThan(0);
  });

  it('goes straight to the network on a first install, where there is no paint to protect', async () => {
    await bootstrapMobileCache('user-1', 'token');
    expect(mockRequests.some((url) => url.includes('/desktop/bootstrap'))).toBe(true);
  });

  it('prefetches recent chats one at a time rather than in a burst', async () => {
    mockChats.push(...Array.from({ length: 5 }, (_, index) => ({ id: `c${index}`, last_message_at: `2026-09-0${index + 1}T10:00:00.000Z` })));
    signalFirstPaint();

    let concurrent = 0;
    let peak = 0;
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      mockRequests.push(String(url));
      concurrent += 1;
      peak = Math.max(peak, concurrent);
      await new Promise((r) => setTimeout(r, 1));
      concurrent -= 1;
      return { ok: true, json: async () => (String(url).includes('/messages') ? { messages: [] } : { events: [], cursor: 1, hasMore: false }) } as unknown as Response;
    });

    await bootstrapMobileCache('user-1', 'token');
    expect(peak).toBe(1);
  });

  it('skips warming a chat that already has a usable local timeline', async () => {
    mockChats.push({ id: 'c1', last_message_at: '2026-09-01T10:00:00.000Z' });
    mockMessageCount = 200;
    signalFirstPaint();

    await bootstrapMobileCache('user-1', 'token');
    expect(mockRequests.some((url) => url.includes('/messages'))).toBe(false);
  });
});
