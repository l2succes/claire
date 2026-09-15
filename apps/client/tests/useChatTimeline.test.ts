import { QueryClient, QueryObserver } from '@tanstack/react-query';
import type { ChatMessage, ChatTimeline } from '@claire/chat-core';
import {
  chatTimelineKey,
  chatTimelineOptions,
  patchChatTimelineMessage,
  updateChatTimeline,
} from '../hooks/useChatTimeline';

jest.mock('../services/mobile-cache', () => ({
  usesNativeMobileCache: () => false,
  cacheTimeline: jest.fn(async () => undefined),
  cachedTimeline: jest.fn(async () => []),
}));

const USER = 'user-1';
const CHAT = 'chat-1';

const message = (over: Partial<ChatMessage> & { id: string }): ChatMessage => ({
  content: 'hello',
  timestamp: '2026-08-17T10:00:00.000Z',
  from_me: false,
  ...over,
});

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

const seed = (qc: QueryClient, timeline: ChatTimeline) =>
  qc.setQueryData<ChatTimeline>(chatTimelineKey(USER, CHAT), timeline);

describe('updateChatTimeline', () => {
  it('does nothing when the conversation has never been opened', () => {
    // The guard that stops the app-wide realtime handler conjuring a one-message
    // "history" for every chat that receives anything.
    const qc = client();
    updateChatTimeline(qc, USER, CHAT, () => ({ messages: [message({ id: 'a' })], reactions: {} }));
    expect(qc.getQueryData(chatTimelineKey(USER, CHAT))).toBeUndefined();
  });

  it('creates the entry when the caller explicitly opts in', () => {
    const qc = client();
    updateChatTimeline(
      qc,
      USER,
      CHAT,
      (previous) => ({ ...previous, messages: [message({ id: 'a' })] }),
      { createIfMissing: true },
    );
    expect(qc.getQueryData<ChatTimeline>(chatTimelineKey(USER, CHAT))?.messages).toHaveLength(1);
  });

  it('does not touch the cache when the updater returns the same reference', () => {
    // setQueryData notifies observers even for an identical reference, so an
    // effect that writes and then depends on its own write would loop forever.
    const qc = client();
    seed(qc, { messages: [message({ id: 'a' })], reactions: {} });
    const before = qc.getQueryState(chatTimelineKey(USER, CHAT))!.dataUpdatedAt;
    updateChatTimeline(qc, USER, CHAT, (previous) => previous);
    expect(qc.getQueryState(chatTimelineKey(USER, CHAT))!.dataUpdatedAt).toBe(before);
  });

  it('ignores a missing user or chat', () => {
    const qc = client();
    updateChatTimeline(qc, undefined, CHAT, () => ({ messages: [], reactions: {} }), { createIfMissing: true });
    updateChatTimeline(qc, USER, undefined, () => ({ messages: [], reactions: {} }), { createIfMissing: true });
    expect(qc.getQueryCache().getAll()).toHaveLength(0);
  });
});

describe('patchChatTimelineMessage', () => {
  it('merges a realtime row into a conversation that is already warm', () => {
    const qc = client();
    seed(qc, { messages: [message({ id: 'a' })], reactions: {} });
    patchChatTimelineMessage(qc, USER, {
      id: 'b',
      chat_id: CHAT,
      content: 'newer',
      timestamp: '2026-08-17T10:05:00.000Z',
      from_me: false,
    });
    expect(
      qc.getQueryData<ChatTimeline>(chatTimelineKey(USER, CHAT))!.messages.map((m) => m.id),
    ).toEqual(['a', 'b']);
  });

  it('leaves the reactions reference intact so list memos do not recompute', () => {
    const qc = client();
    const reactions = { a: [] };
    seed(qc, { messages: [message({ id: 'a' })], reactions });
    patchChatTimelineMessage(qc, USER, {
      id: 'b',
      chat_id: CHAT,
      content: 'newer',
      timestamp: '2026-08-17T10:05:00.000Z',
      from_me: false,
    });
    expect(qc.getQueryData<ChatTimeline>(chatTimelineKey(USER, CHAT))!.reactions).toBe(reactions);
  });

  it('reaches a chat opened from a citation, which observes a highlight-specific key', () => {
    // The screen no longer runs its own per-chat message subscription, so if
    // this only addressed the canonical key a citation-opened conversation
    // would receive nothing at all until its next refetch.
    const qc = client();
    qc.setQueryData<ChatTimeline>(chatTimelineKey(USER, CHAT, 'cited-msg'), {
      messages: [message({ id: 'a' })],
      reactions: {},
    });
    patchChatTimelineMessage(qc, USER, {
      id: 'b',
      chat_id: CHAT,
      content: 'incoming',
      timestamp: '2026-08-17T10:09:00.000Z',
      from_me: false,
    });
    expect(
      qc.getQueryData<ChatTimeline>(chatTimelineKey(USER, CHAT, 'cited-msg'))!.messages.map((m) => m.id),
    ).toEqual(['a', 'b']);
  });

  it('does not fill in a variant whose fetch is still in flight', () => {
    // An entry exists but holds no history yet; writing one message into it
    // would present that message as the whole conversation.
    const qc = client();
    qc.getQueryCache().build(qc, { queryKey: chatTimelineKey(USER, CHAT) });
    patchChatTimelineMessage(qc, USER, { id: 'b', chat_id: CHAT, timestamp: 'x' });
    expect(qc.getQueryData(chatTimelineKey(USER, CHAT))).toBeUndefined();
  });

  it('skips a conversation that is not in the cache', () => {
    const qc = client();
    patchChatTimelineMessage(qc, USER, { id: 'b', chat_id: 'never-opened', timestamp: 'x' });
    expect(qc.getQueryData(chatTimelineKey(USER, 'never-opened'))).toBeUndefined();
  });

  it('ignores a payload with no chat or id', () => {
    const qc = client();
    seed(qc, { messages: [], reactions: {} });
    patchChatTimelineMessage(qc, USER, { id: 'b' });
    patchChatTimelineMessage(qc, USER, { chat_id: CHAT });
    expect(qc.getQueryData<ChatTimeline>(chatTimelineKey(USER, CHAT))!.messages).toHaveLength(0);
  });
});

describe('cache-derived seeds', () => {
  it('a seed written with updatedAt 0 still counts as stale', async () => {
    // Without the explicit timestamp the entry looks freshly fetched, stays
    // fresh for the whole staleTime, and refetchOnMount silently skips the
    // network — turning a warm start into a way to serve stale messages.
    const qc = client();
    qc.setQueryData<ChatTimeline>(
      chatTimelineKey(USER, CHAT),
      { messages: [message({ id: 'a' })], reactions: {} },
      { updatedAt: 0 },
    );
    const observer = new QueryObserver(qc, chatTimelineOptions(qc, USER, CHAT));
    expect(observer.getCurrentResult().isStale).toBe(true);
    expect(observer.getCurrentResult().data?.messages).toHaveLength(1);
  });

  it('a normal write is fresh, so re-entering a chat does not refetch', () => {
    const qc = client();
    seed(qc, { messages: [message({ id: 'a' })], reactions: {} });
    const observer = new QueryObserver(qc, chatTimelineOptions(qc, USER, CHAT));
    expect(observer.getCurrentResult().isStale).toBe(false);
  });
});
