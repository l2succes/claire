import { useEffect, useRef, useState } from 'react';
import {
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
  type UseQueryOptions,
  type UseQueryResult,
} from '@tanstack/react-query';
import { usesNativeMobileCache } from '../services/mobile-cache';

/**
 * Local-first querying.
 *
 * Two rules, and the whole module exists to make them hard to get wrong:
 *
 *   1. The network is never gated on a local read. Waiting for disk before
 *      asking the server just adds the disk read to the critical path -- the
 *      screen still cannot paint until the slower of the two finishes.
 *   2. A local read never overwrites data the network already delivered. The
 *      cache read is speculative; it loses every race it arrives late for.
 *
 * The inbox previously did the opposite of (1) -- `enabled: cacheReady` -- and
 * paid for it on every cold start and every keystroke.
 */

export type LocalSource<TData> = {
  /** Read from the local cache. Return null/undefined for "nothing stored". */
  read: () => Promise<TData | null | undefined>;
  /** Persist a network result. Fire-and-forget; a failure never fails the query. */
  write?: (data: TData) => Promise<void>;
  /** Treat a result as nothing worth seeding. Defaults to null/undefined/empty array. */
  isEmpty?: (data: TData) => boolean;
  /**
   * Seed only when this holds. Screens with filters use it to seed the
   * unfiltered view alone: seeding a cached "everything" list into the Unread
   * tab would paint every conversation as unread.
   */
  enabled?: boolean;
};

function isBlank<TData>(data: TData | null | undefined, isEmpty?: (data: TData) => boolean): boolean {
  if (data === null || data === undefined) return true;
  if (isEmpty) return isEmpty(data);
  return Array.isArray(data) && data.length === 0;
}

/**
 * Seed a query entry from local data, explicitly stale.
 *
 * `updatedAt: 0` is the load-bearing argument. Without it setQueryData stamps
 * the entry as fetched *now*, it counts as fresh for the whole staleTime, and
 * refetchOnMount then silently skips the network -- turning a cache warm-up
 * into a way to serve stale data. Returns false when the network got there
 * first, in which case nothing is written.
 */
export function seedQueryFromLocal<TData>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  data: TData,
): boolean {
  if (queryClient.getQueryData(queryKey) !== undefined) return false;
  queryClient.setQueryData<TData>(queryKey, data, { updatedAt: 0 });
  return true;
}

/** Wrap a queryFn so its result is written back to the local cache. */
export function withLocalWriteThrough<TData>(
  queryFn: () => Promise<TData>,
  write: ((data: TData) => Promise<void>) | undefined,
): () => Promise<TData> {
  if (!write) return queryFn;
  return async () => {
    const data = await queryFn();
    // Deliberately not awaited: persisting is bookkeeping, and the screen
    // should render the moment the data exists, not once it is on disk.
    void Promise.resolve(write(data)).catch(() => undefined);
    return data;
  };
}

/**
 * Race a local read against whatever the query is already doing.
 *
 * Returns `localSettled`, which is false only while the read is genuinely
 * outstanding. A skeleton keyed on `isPending` alone would flash for the length
 * of the disk read on a warm cache; keyed on `localSettled && isPending` it
 * appears only when there is truly nothing to show.
 */
export function useLocalSeed<TData>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  local: LocalSource<TData>,
): { localSettled: boolean } {
  const seedEnabled = local.enabled !== false && usesNativeMobileCache();
  const [localSettled, setLocalSettled] = useState(!seedEnabled);
  // Held in a ref so a caller passing an inline object does not restart the
  // read on every render.
  const localRef = useRef(local);
  localRef.current = local;
  const keyHash = JSON.stringify(queryKey);

  useEffect(() => {
    if (!seedEnabled) {
      setLocalSettled(true);
      return;
    }
    // A warm entry means this key has already been answered; re-reading disk
    // to discover that would be pure cost.
    if (queryClient.getQueryData(queryKey) !== undefined) {
      setLocalSettled(true);
      return;
    }
    let active = true;
    setLocalSettled(false);
    void localRef.current
      .read()
      .then((data) => {
        if (!active || isBlank(data, localRef.current.isEmpty)) return;
        seedQueryFromLocal(queryClient, queryKey, data as TData);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLocalSettled(true);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, keyHash, seedEnabled]);

  return { localSettled };
}

export type LocalFirstQueryResult<TData> = UseQueryResult<TData, Error> & {
  /**
   * Nothing to paint from anywhere: the local read finished empty and the
   * network has not answered. The only condition a full-screen skeleton may
   * key on.
   */
  isCold: boolean;
  localSettled: boolean;
};

export function useLocalFirstQuery<TQueryFnData, TData = TQueryFnData, TKey extends QueryKey = QueryKey>(
  options: UseQueryOptions<TQueryFnData, Error, TData, TKey> & { local: LocalSource<TQueryFnData> },
): LocalFirstQueryResult<TData> {
  const queryClient = useQueryClient();
  const { local, queryFn, ...rest } = options;
  const wrapped =
    typeof queryFn === 'function'
      ? withLocalWriteThrough(queryFn as () => Promise<TQueryFnData>, usesNativeMobileCache() ? local.write : undefined)
      : queryFn;

  const query = useQuery<TQueryFnData, Error, TData, TKey>({
    ...rest,
    queryFn: wrapped,
  } as UseQueryOptions<TQueryFnData, Error, TData, TKey>);

  const { localSettled } = useLocalSeed<TQueryFnData>(queryClient, options.queryKey, local);

  return { ...query, isCold: localSettled && query.isPending, localSettled } as LocalFirstQueryResult<TData>;
}
