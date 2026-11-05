import { searchApi } from '../services/search';
import { supabase } from '../services/supabase';
import { GENERIC_SERVER_ERROR, SESSION_ERROR } from '../services/api-errors';

const originalFetch = global.fetch;
const fetchMock = jest.fn();
const getSession = supabase.auth.getSession as jest.Mock;
const refreshSession = supabase.auth.refreshSession as jest.Mock;

function response(status: number, body: object): Response {
  return { status, ok: status >= 200 && status < 300, json: async () => body } as Response;
}

beforeEach(() => {
  jest.clearAllMocks();
  fetchMock.mockReset();
  global.fetch = fetchMock;
  getSession.mockResolvedValue({ data: { session: { access_token: 'old-token' } } });
  refreshSession.mockResolvedValue({ data: { session: { access_token: 'fresh-token' } }, error: null });
});

afterEach(() => { global.fetch = originalFetch; });

describe.each(['exact', 'answer'] as const)('%s search session recovery', (kind) => {
  const search = () => kind === 'exact' ? searchApi.exact('Maya & launch', 'people') : searchApi.answer('Maya & launch');

  it('recovers a rejected token once and returns the results', async () => {
    fetchMock.mockResolvedValueOnce(response(401, { error: 'Invalid token' }))
      .mockResolvedValueOnce(response(200, { data: { query: 'Maya & launch' } }));

    await expect(search()).resolves.toEqual({ query: 'Maya & launch' });

    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new Headers(fetchMock.mock.calls[1][1].headers).get('Authorization')).toBe('Bearer fresh-token');
    expect(fetchMock.mock.calls[1][0]).toBe(fetchMock.mock.calls[0][0]);
    if (kind === 'answer') {
      expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'POST', body: JSON.stringify({ query: 'Maya & launch' }) });
      expect(new Headers(fetchMock.mock.calls[1][1].headers).get('Content-Type')).toBe('application/json');
    } else {
      expect(fetchMock.mock.calls[1][0]).toContain('/search?q=Maya%20%26%20launch&scope=people&limit=20');
    }
  });

  it('refreshes an expired restored session before sending the search', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'old-token', expires_at: Math.floor(Date.now() / 1000) - 60 } } });
    fetchMock.mockResolvedValueOnce(response(200, { data: { query: 'Maya' } }));

    await expect(search()).resolves.toEqual({ query: 'Maya' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get('Authorization')).toBe('Bearer fresh-token');
  });

  it('stops after one rejected retry and presents the session recovery message', async () => {
    fetchMock.mockResolvedValue(response(401, { error: 'Invalid token' }));

    await expect(search()).rejects.toThrow(SESSION_ERROR);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  it('reports failed refresh safely without resending an unauthorized request', async () => {
    refreshSession.mockResolvedValue({ data: { session: null }, error: new Error('refresh rejected') });
    fetchMock.mockResolvedValueOnce(response(401, { error: 'Invalid token' }));

    await expect(search()).rejects.toThrow(SESSION_ERROR);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps internal server failures out of search error messages', async () => {
    fetchMock.mockResolvedValueOnce(response(500, { error: 'private database diagnostic' }));
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      await expect(search()).rejects.toThrow(GENERIC_SERVER_ERROR);
    } finally {
      warning.mockRestore();
    }
  });
});
