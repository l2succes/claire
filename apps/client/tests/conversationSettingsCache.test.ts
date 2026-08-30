import { useConversationSettingsStore } from '../stores/conversationSettingsStore';
import { cachedConversationSettings } from '../services/mobile-cache';
import { useAuthStore } from '../stores/authStore';

jest.mock('../services/mobile-cache', () => ({
  usesNativeMobileCache: () => true,
  cachedConversationSettings: jest.fn(),
  cacheConversationSettings: jest.fn(async () => undefined),
}));

jest.mock('../services/supabase', () => ({
  supabase: {
    from: () => {
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      builder.select = chain;
      builder.eq = chain;
      // Never resolves: these tests are about what renders while the three
      // queries are still outstanding.
      builder.order = () => new Promise(() => undefined);
      builder.maybeSingle = () => new Promise(() => undefined);
      return builder;
    },
  },
}));

const cachedMock = cachedConversationSettings as jest.MockedFunction<typeof cachedConversationSettings>;

const settingsFor = (chatId: string) => useConversationSettingsStore.getState().settings[chatId];

beforeEach(() => {
  jest.clearAllMocks();
  useConversationSettingsStore.setState({ settings: {} });
  useAuthStore.setState({ user: { id: 'user-1' } } as never);
});

describe('conversation settings cache', () => {
  it('paints the cached answer while the queries are still in flight', async () => {
    cachedMock.mockResolvedValue({
      category: 'personal',
      profile: { relationship_context: 'close friend' },
      smartCards: [{ id: 'card-1' }],
    } as never);

    void useConversationSettingsStore.getState().fetchSettings('chat-1');
    await new Promise((r) => setTimeout(r, 0));

    expect(settingsFor('chat-1').category).toBe('personal');
    expect(settingsFor('chat-1').smartCards).toHaveLength(1);
    // Still loading — the cache is a starting picture, not the answer.
    expect(settingsFor('chat-1').isLoading).toBe(true);
  });

  it('does not overwrite a network result that already landed', async () => {
    // The cache read resolves after the network settled: the slower disk read
    // must not drag the screen back to a stale answer.
    let releaseCache: (value: unknown) => void = () => undefined;
    cachedMock.mockReturnValue(new Promise((r) => { releaseCache = r; }) as never);

    void useConversationSettingsStore.getState().fetchSettings('chat-2');
    await new Promise((r) => setTimeout(r, 0));

    useConversationSettingsStore.setState((state) => ({
      settings: {
        ...state.settings,
        'chat-2': { ...state.settings['chat-2'], category: 'business', isLoading: false } as never,
      },
    }));

    releaseCache({ category: 'personal', profile: null, smartCards: [] });
    await new Promise((r) => setTimeout(r, 0));

    expect(settingsFor('chat-2').category).toBe('business');
  });

  it('skips the cache read once the chat is already loaded in-session', async () => {
    useConversationSettingsStore.setState({
      settings: { 'chat-3': { category: 'personal', profile: null, smartCards: [], isLoading: false, clarificationDismissed: false } },
    });
    void useConversationSettingsStore.getState().fetchSettings('chat-3');
    await new Promise((r) => setTimeout(r, 0));
    expect(cachedMock).not.toHaveBeenCalled();
  });

  it('does not read the cache without a signed-in user', async () => {
    useAuthStore.setState({ user: null } as never);
    void useConversationSettingsStore.getState().fetchSettings('chat-4');
    await new Promise((r) => setTimeout(r, 0));
    expect(cachedMock).not.toHaveBeenCalled();
  });
});
