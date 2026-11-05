import { useConversationSettingsStore } from '../stores/conversationSettingsStore';
import { useAuthStore } from '../stores/authStore';
import { cacheConversationSettings, cachedConversationSettings } from '../services/mobile-cache';

type QueryResult = { data: unknown; error: unknown };
const mockResponses: Record<string, QueryResult | Promise<QueryResult>> = {};

jest.mock('../services/mobile-cache', () => ({
  usesNativeMobileCache: () => true,
  cachedConversationSettings: jest.fn(async () => null),
  cacheConversationSettings: jest.fn(async () => undefined),
}));

jest.mock('../services/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.eq = () => builder;
      builder.maybeSingle = async () => mockResponses[table];
      builder.order = async () => mockResponses[table];
      builder.upsert = async () => ({ error: null });
      return builder;
    },
  },
}));

const currentSettings = {
  category: 'personal' as const,
  profile: { relationship_context: 'Close friend', display_name: 'Priya' } as never,
  smartCards: [{ id: 'card-1' }] as never[],
  isLoading: false,
  clarificationDismissed: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(cachedConversationSettings).mockResolvedValue(null);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  useAuthStore.setState({ user: { id: 'user-1' } } as never);
  useConversationSettingsStore.setState({ settings: { 'chat-1': currentSettings } });
  mockResponses.chat_categories = { data: { category: 'business' }, error: null };
  mockResponses.contact_profiles = { data: { relationship_context: 'New context' }, error: null };
  mockResponses.smart_cards = { data: [{ id: 'card-2' }], error: null };
});

afterEach(() => jest.restoreAllMocks());

it.each(['chat_categories', 'contact_profiles', 'smart_cards'])('retains saved context when %s returns a query error', async (table) => {
  mockResponses[table] = { data: null, error: { message: 'Service unavailable', code: '503' } };

  await useConversationSettingsStore.getState().fetchSettings('chat-1');

  expect(useConversationSettingsStore.getState().settings['chat-1']).toEqual(currentSettings);
  expect(cacheConversationSettings).not.toHaveBeenCalled();
});

it('replaces and persists settings after all queries succeed', async () => {
  await useConversationSettingsStore.getState().fetchSettings('chat-1');

  expect(useConversationSettingsStore.getState().settings['chat-1']).toMatchObject({
    category: 'business', profile: { relationship_context: 'New context' },
    smartCards: [{ id: 'card-2' }], isLoading: false,
  });
  expect(cacheConversationSettings).toHaveBeenCalledWith('user-1', 'chat-1', {
    category: 'business', profile: { relationship_context: 'New context' }, smartCards: [{ id: 'card-2' }],
  });
});

it('honors an empty successful response instead of retaining deleted profile data', async () => {
  mockResponses.contact_profiles = { data: null, error: null };
  await useConversationSettingsStore.getState().fetchSettings('chat-1');
  expect(useConversationSettingsStore.getState().settings['chat-1'].profile).toBeNull();
});

it('keeps a newly saved profile when an older refresh finishes afterwards', async () => {
  let resolve!: (result: QueryResult) => void;
  mockResponses.contact_profiles = new Promise((done) => { resolve = done; });
  const refresh = useConversationSettingsStore.getState().fetchSettings('chat-1');

  await useConversationSettingsStore.getState().updateProfile('chat-1', 'user-1', { relationship_context: 'Context just saved' });
  resolve({ data: { relationship_context: 'Old server snapshot' }, error: null });
  await refresh;

  expect(useConversationSettingsStore.getState().settings['chat-1']).toMatchObject({
    profile: { relationship_context: 'Context just saved' },
    category: 'business', smartCards: [{ id: 'card-2' }], isLoading: false,
  });
  expect(cacheConversationSettings).toHaveBeenCalledWith('user-1', 'chat-1', expect.objectContaining({
    profile: expect.objectContaining({ relationship_context: 'Context just saved' }),
  }));
});

it('does not overwrite an edit with a slow disk snapshot', async () => {
  useConversationSettingsStore.setState({ settings: {} });
  let releaseCache!: (value: never) => void;
  let resolve!: (result: QueryResult) => void;
  jest.mocked(cachedConversationSettings).mockReturnValue(new Promise((done) => { releaseCache = done; }));
  mockResponses.contact_profiles = new Promise((done) => { resolve = done; });
  const refresh = useConversationSettingsStore.getState().fetchSettings('chat-1');
  await useConversationSettingsStore.getState().updateProfile('chat-1', 'user-1', { relationship_context: 'Context just saved' });

  releaseCache({ profile: { relationship_context: 'Old disk snapshot' }, category: 'personal', smartCards: [] } as never);
  await Promise.resolve();
  expect(useConversationSettingsStore.getState().settings['chat-1'].profile?.relationship_context).toBe('Context just saved');

  resolve({ data: { relationship_context: 'Old server snapshot' }, error: null });
  await refresh;
});
