import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLoopProposal } from '../hooks/useLoopProposal';
import { updateLoop } from '../services/loops';
import type { LoopDetail } from '../services/loop-types';

jest.mock('../services/loops', () => ({ updateLoop: jest.fn() }));
jest.mock('../stores/authStore', () => ({ useAuthStore: (selector: any) => selector({ user: { id: 'synthetic-user' } }) }));
jest.mock('../services/loop-query-cache', () => ({ invalidateLoopQueries: jest.fn(async () => {}), patchLoopQueries: jest.fn() }));

it('versions Apply, Undo and a second Apply against their own successful writes', async () => {
  const original: LoopDetail = { id: 'loop', row_version: 5, status: 'open', content: 'Synthetic task', owner: 'me', from_me: true, priority: 'medium' };
  const update = updateLoop as jest.Mock;
  update.mockResolvedValueOnce({ ...original, row_version: 6, owner: 'them' });
  update.mockResolvedValueOnce({ ...original, row_version: 7 });
  update.mockResolvedValueOnce({ ...original, row_version: 8, owner: 'them' });
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const { result } = renderHook(() => useLoopProposal(original, { owner: 'them' }), { wrapper });
  await act(async () => { await result.current.mutation.mutateAsync(false); });
  await act(async () => { await result.current.mutation.mutateAsync(true); });
  await act(async () => { await result.current.mutation.mutateAsync(false); });
  expect(update.mock.calls).toEqual([['loop', { owner: 'them' }, 5], ['loop', { owner: 'me' }, 6], ['loop', { owner: 'them' }, 7]]);
});
