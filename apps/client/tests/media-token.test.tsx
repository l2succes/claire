import { act, renderHook, waitFor } from '@testing-library/react-native';

const mockFetch = jest.fn();
jest.mock('../services/authenticated-fetch', () => ({ authenticatedFetch: (...args: unknown[]) => mockFetch(...args) }));
jest.mock('../services/platforms', () => ({ API_BASE_URL: 'https://api.example.com' }));

import { signMediaUrlNow, useMediaTokenStore, useSignedMediaSource, useSignedMediaUrl } from '../hooks/useMediaToken';

const expiresAt = () => new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();

describe('media token hooks', () => {
  beforeEach(() => {
    useMediaTokenStore.getState().clear();
    mockFetch.mockReset();
    mockFetch.mockImplementation(async () => ({ ok: true, json: async () => ({ token: 'tok', expiresAt: expiresAt() }) }));
  });

  it('withholds proxied media until a token is available, then signs it', async () => {
    const url = 'https://api.example.com/media/server/id';
    const { result } = renderHook(() => useSignedMediaUrl(url));
    expect(result.current).toBeUndefined();
    await waitFor(() => expect(result.current).toBe(`${url}?mt=tok`));
    expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/media/token');
  });

  it('passes other URLs through without fetching a token', () => {
    const { result } = renderHook(() => useSignedMediaUrl('https://cdn.example.com/a.jpg'));
    expect(result.current).toBe('https://cdn.example.com/a.jpg');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('keeps the image cache key independent of the token', async () => {
    const url = 'https://api.example.com/media/server/id';
    const { result } = renderHook(() => useSignedMediaSource(url));
    await waitFor(() => expect(result.current).toEqual({ uri: `${url}?mt=tok`, cacheKey: url }));
  });

  it('forgets the token on sign-out', async () => {
    await act(async () => { await signMediaUrlNow('https://api.example.com/media/server/id'); });
    expect(useMediaTokenStore.getState().token).toBe('tok');
    act(() => useMediaTokenStore.getState().clear());
    expect(useMediaTokenStore.getState().token).toBeNull();
  });
});
