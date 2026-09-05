/**
 * The two invariants the whole local-first effort rests on: the network is
 * never gated on a local read, and a local read never overwrites what the
 * network already delivered.
 */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';

jest.mock('../services/mobile-cache', () => ({ usesNativeMobileCache: jest.fn(() => true) }));

import { usesNativeMobileCache } from '../services/mobile-cache';
import { useLocalFirstQuery } from '../hooks/useLocalFirstQuery';

const nativeCache = usesNativeMobileCache as jest.MockedFunction<typeof usesNativeMobileCache>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

describe('useLocalFirstQuery', () => {
  beforeEach(() => { nativeCache.mockReturnValue(true); });

  it('starts the network request without waiting for the local read', async () => {
    const client = makeClient();
    const queryFn = jest.fn(async () => ['network']);
    // Never resolves: if the query waited on it, queryFn would never run.
    const read = jest.fn(() => new Promise<string[] | null>(() => {}));

    renderHook(
      () => useLocalFirstQuery({ queryKey: ['never-gate'], queryFn, local: { read } }),
      { wrapper: wrapper(client) },
    );

    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(1));
  });

  it('seeds cached data as stale so the refetch still happens', async () => {
    const client = makeClient();
    const network = deferred<string[]>();
    const queryFn = jest.fn(() => network.promise);

    const { result } = renderHook(
      () => useLocalFirstQuery({
        queryKey: ['seed'],
        queryFn,
        staleTime: 60_000,
        local: { read: async () => ['cached'] },
      }),
      { wrapper: wrapper(client) },
    );

    await waitFor(() => expect(result.current.data).toEqual(['cached']));
    // Stamped at 0, not "now": otherwise it counts as fresh for the whole
    // staleTime and refetchOnMount silently skips the network.
    expect(client.getQueryState(['seed'])?.dataUpdatedAt).toBe(0);
    expect(client.getQueryState(['seed'])?.isInvalidated ?? false).toBe(false);
    expect(queryFn).toHaveBeenCalled();

    network.resolve(['network']);
    await waitFor(() => expect(result.current.data).toEqual(['network']));
    expect(client.getQueryState(['seed'])?.dataUpdatedAt).toBeGreaterThan(0);
  });

  it('does not let a slow local read overwrite the network result', async () => {
    const client = makeClient();
    const local = deferred<string[]>();

    const { result } = renderHook(
      () => useLocalFirstQuery({
        queryKey: ['race'],
        queryFn: async () => ['network'],
        local: { read: () => local.promise },
      }),
      { wrapper: wrapper(client) },
    );

    await waitFor(() => expect(result.current.data).toEqual(['network']));
    local.resolve(['stale-cache']);
    await new Promise((r) => setTimeout(r, 10));

    expect(result.current.data).toEqual(['network']);
    expect(client.getQueryState(['race'])?.dataUpdatedAt).toBeGreaterThan(0);
  });

  it('reports isCold only while there is genuinely nothing to show', async () => {
    const client = makeClient();
    const network = deferred<string[]>();

    const { result } = renderHook(
      () => useLocalFirstQuery({
        queryKey: ['cold'],
        queryFn: () => network.promise,
        local: { read: async () => null },
      }),
      { wrapper: wrapper(client) },
    );

    await waitFor(() => expect(result.current.isCold).toBe(true));
    network.resolve(['network']);
    await waitFor(() => expect(result.current.isCold).toBe(false));
  });

  it('is never cold when the cache had something', async () => {
    const client = makeClient();
    const { result } = renderHook(
      () => useLocalFirstQuery({
        queryKey: ['warm'],
        queryFn: () => new Promise<string[]>(() => {}),
        local: { read: async () => ['cached'] },
      }),
      { wrapper: wrapper(client) },
    );

    await waitFor(() => expect(result.current.data).toEqual(['cached']));
    expect(result.current.isCold).toBe(false);
  });

  it('treats an empty cached result as nothing to seed', async () => {
    const client = makeClient();
    const { result } = renderHook(
      () => useLocalFirstQuery({
        queryKey: ['empty'],
        queryFn: () => new Promise<string[]>(() => {}),
        local: { read: async () => [] },
      }),
      { wrapper: wrapper(client) },
    );

    await waitFor(() => expect(result.current.isCold).toBe(true));
    expect(client.getQueryData(['empty'])).toBeUndefined();
  });

  it('writes the network result back to the cache exactly once', async () => {
    const client = makeClient();
    const write = jest.fn(async () => undefined);

    const { result } = renderHook(
      () => useLocalFirstQuery({
        queryKey: ['write'],
        queryFn: async () => ['network'],
        local: { read: async () => null, write },
      }),
      { wrapper: wrapper(client) },
    );

    await waitFor(() => expect(result.current.data).toEqual(['network']));
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    expect(write).toHaveBeenCalledWith(['network']);
  });

  it('surfaces the data even when persisting it fails', async () => {
    const client = makeClient();
    const write = jest.fn(async () => { throw new Error('disk full'); });

    const { result } = renderHook(
      () => useLocalFirstQuery({
        queryKey: ['write-fails'],
        queryFn: async () => ['network'],
        local: { read: async () => null, write },
      }),
      { wrapper: wrapper(client) },
    );

    await waitFor(() => expect(result.current.data).toEqual(['network']));
    expect(result.current.isError).toBe(false);
  });

  it('skips the cache entirely when seeding is disabled for this key', async () => {
    const client = makeClient();
    const read = jest.fn(async () => ['cached']);

    const { result } = renderHook(
      () => useLocalFirstQuery({
        queryKey: ['filtered'],
        queryFn: async () => ['network'],
        local: { read, enabled: false },
      }),
      { wrapper: wrapper(client) },
    );

    await waitFor(() => expect(result.current.data).toEqual(['network']));
    expect(read).not.toHaveBeenCalled();
  });

  it('does no local work on a host without an encrypted cache', async () => {
    nativeCache.mockReturnValue(false);
    const client = makeClient();
    const read = jest.fn(async () => ['cached']);
    const write = jest.fn(async () => undefined);

    const { result } = renderHook(
      () => useLocalFirstQuery({
        queryKey: ['browser'],
        queryFn: async () => ['network'],
        local: { read, write },
      }),
      { wrapper: wrapper(client) },
    );

    await waitFor(() => expect(result.current.data).toEqual(['network']));
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });
});
