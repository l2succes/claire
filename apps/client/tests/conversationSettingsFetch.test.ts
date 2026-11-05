import { useConversationSettingsStore } from '../stores/conversationSettingsStore';
import { useAuthStore } from '../stores/authStore';
import { cacheConversationSettings } from '../services/mobile-cache';

const mockResponses: Record<string, { data: unknown; error: unknown }> = {};

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
