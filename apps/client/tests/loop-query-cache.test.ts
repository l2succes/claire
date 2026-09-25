import { QueryClient } from '@tanstack/react-query';
import {
  invalidateLoopQueries,
  patchLoopQueries,
  removeLoopFromQueries,
  restoreLoopQueries,
  snapshotLoopQueries,
} from '../services/loop-query-cache';
import type { LoopAttentionItem } from '../services/loops';
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
    queryClient.setQueryData(['loop-attention', 'user-1'], [{ loop_id: loop.id, loop }]);
  });

  it('removes a completed loop from Home while retaining its completed history', () => {
    patchLoopQueries(queryClient, 'user-1', loop.id, { status: 'done' });

    expect(queryClient.getQueryData<LoopItem[]>(['mobile-home-loops', 'user-1'])).toEqual([]);
    expect(queryClient.getQueryData<LoopItem[]>(['mobile-loops', 'user-1'])?.[0].status).toBe('done');
    expect(queryClient.getQueryData<LoopDetail>(['loop-detail', loop.id])?.status).toBe('done');
    expect(queryClient.getQueryData(['loop-attention', 'user-1'])).toEqual([]);
  });

  it('restores every surface when the mutation fails', () => {
    const snapshot = snapshotLoopQueries(queryClient, 'user-1', loop.id);
    patchLoopQueries(queryClient, 'user-1', loop.id, { status: 'done' });

    restoreLoopQueries(queryClient, 'user-1', loop.id, snapshot);

    expect(queryClient.getQueryData<LoopItem[]>(['mobile-home-loops', 'user-1'])).toEqual([loop]);
    expect(queryClient.getQueryData<LoopItem[]>(['mobile-loops', 'user-1'])).toEqual([loop]);
    expect(queryClient.getQueryData<LoopDetail>(['loop-detail', loop.id])).toEqual(loop);
    expect(queryClient.getQueryData(['loop-attention', 'user-1'])).toEqual([{ loop_id: loop.id, loop }]);
  });

  it('removes a dismissed loop from every collection', () => {
    removeLoopFromQueries(queryClient, 'user-1', loop.id);

    expect(queryClient.getQueryData<LoopItem[]>(['mobile-home-loops', 'user-1'])).toEqual([]);
    expect(queryClient.getQueryData<LoopItem[]>(['mobile-loops', 'user-1'])).toEqual([]);
    expect(queryClient.getQueryData(['loop-detail', loop.id])).toBeUndefined();
    expect(queryClient.getQueryData(['loop-attention', 'user-1'])).toEqual([]);
  });

  it('invalidates the inbox loop marker when a loop changes state', async () => {
    queryClient.setQueryData(['inbox-open-loops', 'user-1'], new Set(['chat-1']));

    await invalidateLoopQueries(queryClient, 'user-1', loop.id);

    expect(queryClient.getQueryState(['inbox-open-loops', 'user-1'])?.isInvalidated).toBe(true);
  });
});


describe('attention queue actions', () => {
  it.each([
    { status: 'snoozed', snoozed_until: '2099-01-01T09:00:00Z' },
    { reviewed_at: '2026-09-23T09:00:00Z' },
    { status: 'dropped' },
    { owner: 'them', status: 'waiting' },
  ] as Partial<LoopItem>[])('removes an acted-on item immediately: %j', patch => {
    const client = new QueryClient();
    client.setQueryData(['loop-attention', 'user-1'], [{ loop_id: loop.id, loop }]);
    patchLoopQueries(client, 'user-1', loop.id, patch);
    expect(client.getQueryData(['loop-attention', 'user-1'])).toEqual([]);
  });

  it('does not restore another successfully closed row when an action fails', () => {
    const client = new QueryClient();
    const other = { ...loop, id: 'loop-2' };
    client.setQueryData(['mobile-loops', 'user-1'], [loop, other]);
    client.setQueryData(['loop-attention', 'user-1'], [loop, other].map(item => ({ loop_id: item.id, loop: item })));
    const snapshot = snapshotLoopQueries(client, 'user-1', loop.id);
    patchLoopQueries(client, 'user-1', loop.id, { status: 'done' });
    patchLoopQueries(client, 'user-1', other.id, { status: 'done' });
    restoreLoopQueries(client, 'user-1', loop.id, snapshot);
    expect(client.getQueryData<LoopAttentionItem[]>(['loop-attention', 'user-1'])?.map(item => item.loop_id)).toEqual([loop.id]);
    expect(client.getQueryData<LoopItem[]>(['mobile-loops', 'user-1'])?.find(item => item.id === other.id)?.status).toBe('done');
  });
});
