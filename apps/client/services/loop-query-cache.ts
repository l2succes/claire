import type { QueryClient } from '@tanstack/react-query';
import type { LoopDetail, LoopItem } from './loop-types';

const HOME_STATUSES: LoopItem['status'][] = ['open', 'waiting'];

export function belongsInHomeLoops(loop: Pick<LoopItem, 'status'>): boolean {
  return HOME_STATUSES.includes(loop.status);
}

export type LoopQuerySnapshot = {
  list: LoopItem[] | undefined;
  home: LoopItem[] | undefined;
  detail: LoopDetail | undefined;
};

function listKey(userId: string | undefined) {
  return ['mobile-loops', userId] as const;
}

function homeKey(userId: string | undefined) {
  return ['mobile-home-loops', userId] as const;
}

function detailKey(loopId: string) {
  return ['loop-detail', loopId] as const;
}

export function snapshotLoopQueries(
  queryClient: QueryClient,
  userId: string | undefined,
  loopId: string,
): LoopQuerySnapshot {
  return {
    list: queryClient.getQueryData<LoopItem[]>(listKey(userId)),
    home: queryClient.getQueryData<LoopItem[]>(homeKey(userId)),
    detail: queryClient.getQueryData<LoopDetail>(detailKey(loopId)),
  };
}

export function restoreLoopQueries(
  queryClient: QueryClient,
  userId: string | undefined,
  loopId: string,
  snapshot: LoopQuerySnapshot,
): void {
  queryClient.setQueryData(listKey(userId), snapshot.list);
  queryClient.setQueryData(homeKey(userId), snapshot.home);
  queryClient.setQueryData(detailKey(loopId), snapshot.detail);
}

/** Keep the Loops tab, Home focus card and detail route in one state. */
export function patchLoopQueries(
  queryClient: QueryClient,
  userId: string | undefined,
  loopId: string,
  patch: Partial<LoopItem>,
): void {
  queryClient.setQueryData<LoopItem[]>(listKey(userId), (items) =>
    items?.map((item) => item.id === loopId ? { ...item, ...patch } : item));
  queryClient.setQueryData<LoopItem[]>(homeKey(userId), (items) => {
    if (!items) return items;
    const nextStatus = patch.status;
    if (nextStatus && !belongsInHomeLoops({ status: nextStatus })) {
      return items.filter((item) => item.id !== loopId);
    }
    return items.map((item) => item.id === loopId ? { ...item, ...patch } : item);
  });
  queryClient.setQueryData<LoopDetail>(detailKey(loopId), (item) =>
    item ? { ...item, ...patch } : item);
}

export function removeLoopFromQueries(
  queryClient: QueryClient,
  userId: string | undefined,
  loopId: string,
): void {
  queryClient.setQueryData<LoopItem[]>(listKey(userId), (items) =>
    items?.filter((item) => item.id !== loopId));
  queryClient.setQueryData<LoopItem[]>(homeKey(userId), (items) =>
    items?.filter((item) => item.id !== loopId));
  queryClient.removeQueries({ queryKey: detailKey(loopId), exact: true });
}

export async function invalidateLoopQueries(
  queryClient: QueryClient,
  userId: string | undefined,
  loopId: string,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: listKey(userId) }),
    queryClient.invalidateQueries({ queryKey: homeKey(userId) }),
    queryClient.invalidateQueries({ queryKey: ['inbox-open-loops', userId] }),
    queryClient.invalidateQueries({ queryKey: detailKey(loopId) }),
  ]);
}
