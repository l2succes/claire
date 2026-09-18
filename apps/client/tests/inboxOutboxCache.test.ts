import { QueryClient } from '@tanstack/react-query';
import { inboxQueryKey, patchInboxRealtimeMessage } from '../hooks/useInboxMessages';
import { cacheTimeline, touchCachedChatFromMessage } from '../services/mobile-cache';
import { Platform } from '../types/platform';

jest.mock('../services/mobile-cache', () => ({
  usesNativeMobileCache: () => true,
  cacheTimeline: jest.fn(async () => undefined),
  touchCachedChatFromMessage: jest.fn(async () => undefined),
  cachedTimeline: jest.fn(async () => []),
}));

it('keeps queued previews out of the delivered-message cache until acknowledged', () => {
  const client = new QueryClient();
  const key = inboxQueryKey('user', '', 'all', 'all');
  client.setQueryData(key, { pages: [{ messages: [], hasMore: false, nextCursor: null }], pageParams: [null] });
  const queued = { id: 'optimistic-a', chat_id: 'chat', content: 'queued text', from_me: true,
    timestamp: '2026-09-15T12:00:00Z', platform: Platform.WHATSAPP };
  patchInboxRealtimeMessage(client, 'user', queued, { persist: false });
  expect((client.getQueryData(key) as any).pages[0].messages[0].content).toBe('queued text');
  expect(cacheTimeline).not.toHaveBeenCalled();
  expect(touchCachedChatFromMessage).not.toHaveBeenCalled();
  patchInboxRealtimeMessage(client, 'user', { ...queued, platform_message_id: '$ack' } as any);
  expect(cacheTimeline).toHaveBeenCalledTimes(1);
  expect(touchCachedChatFromMessage).toHaveBeenCalledTimes(1);
});
