import { authenticatedFetch } from '../services/authenticated-fetch';
import { supabase } from '../services/supabase';
import { router } from 'expo-router';

describe('authenticatedFetch', () => {
  it('refreshes and retries once when a backgrounded token is rejected', async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { access_token: 'expired-token' } },
    });
    (supabase.auth.refreshSession as jest.Mock).mockResolvedValue({
      data: { session: { access_token: 'fresh-token' } },
      error: null,
    });
    const previousFetch = global.fetch;
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ status: 401 } as Response)
      .mockResolvedValueOnce({ status: 200 } as Response);
    global.fetch = fetchMock;

    const response = await authenticatedFetch('https://claire.test/ai');

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer expired-token');
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get('Authorization')).toBe('Bearer fresh-token');
    global.fetch = previousFetch;
  });

  it('opens the upgrade screen when the server reports exhausted credits', async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { access_token: 'valid-token' } },
    });
    const previousFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({ status: 402 } as Response);

    await authenticatedFetch('https://claire.test/ai');
    await Promise.resolve();

    expect(router.push).toHaveBeenCalledWith('/paywall?source=credits');
    global.fetch = previousFetch;
  });
});
