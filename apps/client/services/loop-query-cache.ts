import type { QueryClient } from '@tanstack/react-query';
import type { LoopDetail, LoopItem } from './loop-types';
import type { LoopAttentionItem } from './loops';

const HOME_STATUSES: LoopItem['status'][] = ['open', 'waiting'];

export function belongsInHomeLoops(loop: Pick<LoopItem, 'status'>): boolean {
  return HOME_STATUSES.includes(loop.status);
}

export type LoopQuerySnapshot = {
  list: LoopItem[] | undefined;
  home: LoopItem[] | undefined;
  detail: LoopDetail | undefined;
  attention: LoopAttentionItem[] | undefined;
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
    attention: queryClient.getQueryData<LoopAttentionItem[]>(['loop-attention', userId]),
  };
}

export function restoreLoopQueries(
  queryClient: QueryClient,
  userId: string | undefined,
  loopId: string,
  snapshot: LoopQuerySnapshot,
): void {
  // Restore only this loop; another row may have succeeded in the meantime.
  function restoreItem<T>(current: T[] | undefined, previous: T[] | undefined, id: (item: T) => string) {
    if (!previous) return current;
    const original = previous.find(item => id(item) === loopId);
    const remaining = (current ?? []).filter(item => id(item) !== loopId);
    if (original) remaining.splice(Math.min(previous.indexOf(original), remaining.length), 0, original);
    return remaining;
  }
  queryClient.setQueryData<LoopItem[]>(listKey(userId), current => restoreItem(current, snapshot.list, item => item.id));
  queryClient.setQueryData<LoopItem[]>(homeKey(userId), current => restoreItem(current, snapshot.home, item => item.id));
  queryClient.setQueryData(detailKey(loopId), snapshot.detail);
  queryClient.setQueryData<LoopAttentionItem[]>(['loop-attention', userId], current =>
    restoreItem(current, snapshot.attention, item => item.loop_id));
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
  queryClient.setQueryData<LoopAttentionItem[]>(['loop-attention', userId], (items) =>
    items?.flatMap(item => {
      if (item.loop_id !== loopId) return [item];
      const loop = { ...item.loop, ...patch };
      if (!HOME_STATUSES.includes(loop.status)
        || (loop.visibility && loop.visibility !== 'surfaced')
        || (patch.reviewed_at && patch.reviewed_at !== item.loop.reviewed_at)
        || (patch.owner && patch.owner !== item.loop.owner)
        || (patch.row_version !== undefined && patch.row_version !== item.row_version)) return [];
      return [{ ...item, loop }];
    }));
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
  queryClient.setQueryData<LoopAttentionItem[]>(['loop-attention', userId], items =>
    items?.filter(item => item.loop_id !== loopId));
}

export async function invalidateLoopQueries(
  queryClient: QueryClient,
  userId: string | undefined,
  loopId: string,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: listKey(userId) }),
    queryClient.invalidateQueries({ queryKey: ['loop-attention', userId] }),
    queryClient.invalidateQueries({ queryKey: homeKey(userId) }),
    queryClient.invalidateQueries({ queryKey: ['inbox-open-loops', userId] }),
    queryClient.invalidateQueries({ queryKey: detailKey(loopId) }),
  ]);
}
