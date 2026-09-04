/**
 * Clearing local data is destructive and irreversible: it deletes the
 * encrypted message database and the Keychain key that opens it. It must
 * happen on a real sign-out and at no other time.
 */
const mockClearMobileCache = jest.fn(() => Promise.resolve(undefined));

jest.mock('../services/mobile-cache', () => ({ clearMobileCache: (...args: unknown[]) => mockClearMobileCache(...(args as [])) }));
jest.mock('../services/query-client', () => ({ resetQueryClient: jest.fn() }));
jest.mock('../services/notifications', () => ({ deregisterNotificationDevice: jest.fn(async () => undefined) }));
jest.mock('../stores/platformStore', () => ({ usePlatformStore: { persist: { clearStorage: () => Promise.resolve() } } }));

let authListener: ((event: string, session: unknown) => void) | null = null;
jest.mock('../services/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({ data: { session: null } })),
      refreshSession: jest.fn(),
      signOut: jest.fn(async () => ({ error: null })),
      onAuthStateChange: (callback: (event: string, session: unknown) => void) => {
        authListener = callback;
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      },
    },
  },
}));

import { useAuthStore } from '../stores/authStore';

describe('local data is only cleared by a real sign-out', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await useAuthStore.getState().initialize();
    useAuthStore.setState({ isAuthenticated: true, token: 't', user: { id: 'user-1', email: 'a@b.test' }, isLoading: false } as never);
  });

  it('keeps the cache when a token refresh fails with no session', async () => {
    // Offline: supabase reports no session, but the user has not signed out.
    // Deleting the encrypted cache here would destroy exactly the data they
    // need in order to keep reading while disconnected.
    authListener?.('TOKEN_REFRESHED', null);
    await Promise.resolve();

    expect(mockClearMobileCache).not.toHaveBeenCalled();
  });

  it('clears the cache on an explicit sign-out', async () => {
    authListener?.('SIGNED_OUT', null);
    await Promise.resolve();

    expect(mockClearMobileCache).toHaveBeenCalledWith('user-1');
  });
});
