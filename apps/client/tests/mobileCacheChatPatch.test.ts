/**
 * Realtime used to update React Query only, so cache_chats moved just once per
 * foreground sync: a cold start painted instantly and showed yesterday's
 * previews. These cover the write-through that fixes it, on the web
 * implementation (the native one is the same logic over SQL).
 */
describe('cached chat write-through', () => {
  let cache: typeof import('../services/mobile-cache.web');

  beforeEach(async () => {
    jest.resetModules();
    jest.doMock('@claire/host', () => ({
      host: { name: 'electron', capabilities: { encryptedCache: true }, readEncryptedCache: async () => null, writeEncryptedCache: async () => undefined, clearEncryptedCache: async () => undefined },
    }));
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    cache = require('../services/mobile-cache.web') as typeof import('../services/mobile-cache.web');
    await cache.cacheBootstrap('u', {
      cursor: 1,
      chats: [{
        id: 'chat-1',
        name: 'Ada',
        contact: { name: 'Ada', avatar_url: 'https://example.test/a.png' },
        unread_count: 0,
        last_message_at: '2026-09-01T10:00:00.000Z',
        latest_message: { id: 'm1', chat_id: 'chat-1', timestamp: '2026-09-01T10:00:00.000Z', content: 'older' },
      }],
      loops: [],
      preferences: null,
    });
  });

  const chat = async () => (await cache.hydrateMobileCache('u')).chats[0];

  it('advances the preview for a newer message', async () => {
    await cache.touchCachedChatFromMessage('u', { id: 'm2', chat_id: 'chat-1', timestamp: '2026-09-02T10:00:00.000Z', content: 'newer', from_me: false });

    const row = await chat();
    expect((row.latest_message as Record<string, unknown>).content).toBe('newer');
    expect(row.last_message_at).toBe('2026-09-02T10:00:00.000Z');
  });

  it('bumps unread for an inbound message and leaves outbound alone', async () => {
    await cache.touchCachedChatFromMessage('u', { id: 'm2', chat_id: 'chat-1', timestamp: '2026-09-02T10:00:00.000Z', from_me: false });
    expect((await chat()).unread_count).toBe(1);

    await cache.touchCachedChatFromMessage('u', { id: 'm3', chat_id: 'chat-1', timestamp: '2026-09-03T10:00:00.000Z', from_me: true });
    expect((await chat()).unread_count).toBe(1);
  });

  it('never lets an edit to an older message become the preview', async () => {
    await cache.touchCachedChatFromMessage('u', { id: 'm2', chat_id: 'chat-1', timestamp: '2026-09-02T10:00:00.000Z', content: 'newer', from_me: false });
    await cache.touchCachedChatFromMessage('u', { id: 'm0', chat_id: 'chat-1', timestamp: '2026-08-30T10:00:00.000Z', content: 'edited old', from_me: false });

    const row = await chat();
    expect((row.latest_message as Record<string, unknown>).content).toBe('newer');
    expect(row.last_message_at).toBe('2026-09-02T10:00:00.000Z');
  });

  it('updates the preview in place when the newest message itself is edited', async () => {
    await cache.touchCachedChatFromMessage('u', { id: 'm1', chat_id: 'chat-1', timestamp: '2026-09-01T10:00:00.000Z', content: 'edited', from_me: false });

    const row = await chat();
    expect((row.latest_message as Record<string, unknown>).content).toBe('edited');
    // An edit is not a new message, so it must not move the unread count.
    expect(row.unread_count).toBe(0);
  });

  it('keeps the contact join a realtime chat row does not carry', async () => {
    await cache.patchCachedChat('u', 'chat-1', { unread_count: 4, is_pinned: true });

    const row = await chat();
    expect(row.contact).toEqual({ name: 'Ada', avatar_url: 'https://example.test/a.png' });
    expect(row.latest_message).toBeTruthy();
    expect(row.unread_count).toBe(4);
    expect(row.is_pinned).toBe(true);
  });

  it('ignores a chat it has never seen rather than writing a nameless stub', async () => {
    await cache.patchCachedChat('u', 'chat-unknown', { unread_count: 2 });
    expect((await cache.hydrateMobileCache('u')).chats).toHaveLength(1);
  });

  it('stores and clears keyed query snapshots', async () => {
    await cache.writeQuerySnapshot('u', 'home-brief', { headline: 'Three loops need a reply' });
    expect((await cache.readQuerySnapshot<{ headline: string }>('u', 'home-brief'))?.data.headline).toBe('Three loops need a reply');

    await cache.writeQuerySnapshot('u', 'person:1', { name: 'Ada' });
    await cache.deleteQuerySnapshots('u', 'person:');
    expect(await cache.readQuerySnapshot('u', 'person:1')).toBeNull();
    expect(await cache.readQuerySnapshot('u', 'home-brief')).not.toBeNull();
  });
});
