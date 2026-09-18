/**
 * Sign-out used to clear AsyncStorage and nothing else: the encrypted message
 * database, its Keychain key, and a live in-memory query cache all survived it.
 * Only the Privacy screen ever removed them.
 */
const mockClearMobileCache = jest.fn(async () => undefined);
const mockResetQueryClient = jest.fn();
const mockClearStorage = jest.fn(async () => undefined);
const mockSignOut = jest.fn(async () => ({ error: null }));

jest.mock('../services/mobile-cache', () => ({ clearMobileCache: (...args: unknown[]) => mockClearMobileCache(...(args as [])) }));
jest.mock('../services/query-client', () => ({ resetQueryClient: () => mockResetQueryClient() }));
jest.mock('../services/notifications', () => ({ deregisterNotificationDevice: jest.fn(async () => undefined) }));
jest.mock('../stores/platformStore', () => ({
  usePlatformStore: { persist: { clearStorage: () => mockClearStorage() } },
}));
jest.mock('../services/supabase', () => ({
  supabase: {
    auth: {
      signOut: () => mockSignOut(),
      getSession: jest.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: jest.fn(),
    },
  },
}));

import { useAuthStore } from '../stores/authStore';

describe('logout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({
      isAuthenticated: true,
      token: 'token-1',
      user: { id: 'user-1', email: 'a@example.test' },
      isLoading: false,
    } as never);
  });

  it('deletes the encrypted cache and the query cache for the account signing out', async () => {
    await useAuthStore.getState().logout();

    expect(mockClearMobileCache).toHaveBeenCalledWith('user-1');
    expect(mockResetQueryClient).toHaveBeenCalled();
    expect(mockClearStorage).toHaveBeenCalled();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('still signs the user out when clearing local data fails', async () => {
    mockClearMobileCache.mockRejectedValueOnce(new Error('database locked'));
    await useAuthStore.getState().logout();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().token).toBeNull();
  });
});
