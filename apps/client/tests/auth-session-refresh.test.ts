import type { Session } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
import { useAuthStore } from '../stores/authStore';

const auth = supabase.auth as unknown as {
  getSession: jest.Mock;
  refreshSession: jest.Mock;
  onAuthStateChange: jest.Mock;
};

function session(accessToken: string, expiresAt: number): Session {
  return {
    access_token: accessToken,
    refresh_token: 'refresh-token',
    expires_in: 3600,
    expires_at: expiresAt,
    token_type: 'bearer',
    user: {
      id: 'user-1',
      email: 'luc@example.com',
      app_metadata: {},
      user_metadata: { name: 'Luc' },
      aud: 'authenticated',
      created_at: '2026-08-19T00:00:00.000Z',
    },
  } as Session;
}

describe('auth session refresh', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({ isAuthenticated: false, isLoading: true, token: null, user: null });
    auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } });
  });

  it('refreshes an expired native session before API consumers receive its token', async () => {
    auth.getSession.mockResolvedValue({
      data: { session: session('expired-access-token', Math.floor(Date.now() / 1000) - 1) },
    });
    auth.refreshSession.mockResolvedValue({
      data: { session: session('fresh-access-token', Math.floor(Date.now() / 1000) + 3600) },
      error: null,
    });

    await useAuthStore.getState().initialize();

    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: true,
      isLoading: false,
      token: 'fresh-access-token',
      user: { id: 'user-1', email: 'luc@example.com' },
    });
  });
});
