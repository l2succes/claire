import { QueryClient, type InfiniteData } from '@tanstack/react-query';
import {
  inboxQueryKey,
  patchInboxRealtimeMessage,
  type InboxMessage,
} from '../hooks/useInboxMessages';
import { Platform } from '../types/platform';

jest.mock('../services/mobile-cache', () => ({
  usesNativeMobileCache: () => false,
  cacheTimeline: jest.fn(async () => undefined),
  cachedTimeline: jest.fn(async () => []),
}));

const USER = 'user-1';
const CHAT = 'chat-1';

type Page = { messages: InboxMessage[]; hasMore: boolean; nextCursor: null };

const row = (over: Partial<InboxMessage> = {}): InboxMessage => ({
  id: 'server-1',
  conversation_key: `${Platform.WHATSAPP}:${CHAT}`,
  chat_id: CHAT,
  chat_name: 'Lucas',
  contact_name: 'Lucas',
  content: 'their older message',
  timestamp: '2026-08-26T10:00:00.000Z',
  from_me: false,
  is_group: false,
  platform: Platform.WHATSAPP,
  unread_count: 0,
  ...over,
});

function seed(qc: QueryClient, messages: InboxMessage[]) {
  qc.setQueryData<InfiniteData<Page>>(inboxQueryKey(USER, '', 'all', 'all'), {
    pages: [{ messages, hasMore: false, nextCursor: null }],
    pageParams: [null],
  });
}

const feed = (qc: QueryClient) =>
  qc.getQueryData<InfiniteData<Page>>(inboxQueryKey(USER, '', 'all', 'all'))!.pages[0].messages;

describe('inbox preview after sending', () => {
  it('shows the sent message immediately, without waiting for the bridge round trip', () => {
    // The send endpoint never writes a messages row — it lands only when the
    // platform echoes back through Matrix. Without this patch the subtitle
    // keeps showing the previous message for as long as that takes.
    const qc = new QueryClient();
    seed(qc, [row()]);

    patchInboxRealtimeMessage(qc, USER, {
      id: 'optimistic-1',
      chat_id: CHAT,
      content: 'what I just sent',
      timestamp: '2026-08-26T10:05:00.000Z',
      from_me: true,
      is_group: false,
      platform: Platform.WHATSAPP,
      contact_name: 'Lucas',
    });

    expect(feed(qc)[0].content).toBe('what I just sent');
    expect(feed(qc)[0].from_me).toBe(true);
  });

  it('reconciles to the real row without duplicating the conversation', () => {
    const qc = new QueryClient();
    seed(qc, [row()]);
    const sent = {
      chat_id: CHAT,
      content: 'what I just sent',
      from_me: true,
      is_group: false,
      platform: Platform.WHATSAPP,
      contact_name: 'Lucas',
    };
    patchInboxRealtimeMessage(qc, USER, { ...sent, id: 'optimistic-1', timestamp: '2026-08-26T10:05:00.000Z' });
    // The bridge echo arrives with the durable id.
    patchInboxRealtimeMessage(qc, USER, { ...sent, id: 'server-9', timestamp: '2026-08-26T10:05:01.000Z' });

    expect(feed(qc)).toHaveLength(1);
    expect(feed(qc)[0].id).toBe('server-9');
    expect(feed(qc)[0].content).toBe('what I just sent');
  });

  it('does not inflate the unread count for a message the user sent', () => {
    const qc = new QueryClient();
    seed(qc, [row({ unread_count: 3 })]);
    patchInboxRealtimeMessage(qc, USER, {
      id: 'optimistic-1',
      chat_id: CHAT,
      content: 'mine',
      timestamp: '2026-08-26T10:05:00.000Z',
      from_me: true,
      platform: Platform.WHATSAPP,
    });
    expect(feed(qc)[0].unread_count).toBe(3);
  });

  it('moves the conversation to the top of the feed', () => {
    const qc = new QueryClient();
    const other = row({
      id: 'other-1',
      chat_id: 'chat-2',
      conversation_key: `${Platform.WHATSAPP}:chat-2`,
      chat_name: 'Someone else',
      timestamp: '2026-08-26T10:04:00.000Z',
    });
    seed(qc, [other, row()]);
    patchInboxRealtimeMessage(qc, USER, {
      id: 'optimistic-1',
      chat_id: CHAT,
      content: 'mine',
      timestamp: '2026-08-26T10:05:00.000Z',
      from_me: true,
      platform: Platform.WHATSAPP,
    });
    expect(feed(qc)[0].chat_id).toBe(CHAT);
  });
});
