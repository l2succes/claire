import { QueryClient } from '@tanstack/react-query';
import {
  patchLoopQueries,
  removeLoopFromQueries,
  restoreLoopQueries,
  snapshotLoopQueries,
} from '../services/loop-query-cache';
import type { LoopDetail, LoopItem } from '../services/loop-types';

const loop = {
  id: 'loop-1',
  content: 'Send the deck',
  status: 'open',
  owner: 'me',
  priority: 'high',
  from_me: true,
} as LoopItem;

describe('loop query cache reconciliation', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient();
    queryClient.setQueryData(['mobile-loops', 'user-1'], [loop]);
    queryClient.setQueryData(['mobile-home-loops', 'user-1'], [loop]);
    queryClient.setQueryData(['loop-detail', loop.id], loop as LoopDetail);
  });

  it('removes a completed loop from Home while retaining its completed history', () => {
    patchLoopQueries(queryClient, 'user-1', loop.id, { status: 'done' });

    expect(queryClient.getQueryData<LoopItem[]>(['mobile-home-loops', 'user-1'])).toEqual([]);
    expect(queryClient.getQueryData<LoopItem[]>(['mobile-loops', 'user-1'])?.[0].status).toBe('done');
    expect(queryClient.getQueryData<LoopDetail>(['loop-detail', loop.id])?.status).toBe('done');
  });

  it('restores every surface when the mutation fails', () => {
    const snapshot = snapshotLoopQueries(queryClient, 'user-1', loop.id);
    patchLoopQueries(queryClient, 'user-1', loop.id, { status: 'done' });

    restoreLoopQueries(queryClient, 'user-1', loop.id, snapshot);

    expect(queryClient.getQueryData<LoopItem[]>(['mobile-home-loops', 'user-1'])).toEqual([loop]);
    expect(queryClient.getQueryData<LoopItem[]>(['mobile-loops', 'user-1'])).toEqual([loop]);
    expect(queryClient.getQueryData<LoopDetail>(['loop-detail', loop.id])).toEqual(loop);
  });

  it('removes a dismissed loop from every collection', () => {
    removeLoopFromQueries(queryClient, 'user-1', loop.id);

    expect(queryClient.getQueryData<LoopItem[]>(['mobile-home-loops', 'user-1'])).toEqual([]);
    expect(queryClient.getQueryData<LoopItem[]>(['mobile-loops', 'user-1'])).toEqual([]);
    expect(queryClient.getQueryData(['loop-detail', loop.id])).toBeUndefined();
  });
});
