import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useLoopDetail } from '../hooks/useLoopDetail';
import { fetchLoopDetail, type LoopDetail } from '../services/loops';

jest.mock('../services/loops', () => ({ fetchLoopDetail: jest.fn() }));
const mockFetch = fetchLoopDetail as jest.MockedFunction<typeof fetchLoopDetail>;
const loop: LoopDetail = {
  id: 'loop-1', content: 'Send the deck', status: 'open', priority: 'high',
  from_me: true, deadline: '2026-11-06T10:00:00Z',
};

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockImplementation(() => new Promise(() => {}));
});

it.each(['mobile-loops', 'mobile-home-loops', 'loop-attention'])('paints a cached %s loop while full detail is pending', async (source) => {
  const { client, wrapper } = setup();
  client.setQueryData([source, 'user-1'], source === 'loop-attention' ? [{ loop_id: loop.id, loop }] : [loop]);
  let resolve!: (detail: LoopDetail) => void;
  mockFetch.mockImplementation(() => new Promise((done) => { resolve = done; }));
  const { result } = renderHook(() => useLoopDetail('user-1', loop.id), { wrapper });

  expect(result.current.data?.content).toBe('Send the deck');
  expect(result.current.data?.deadline).toBe(loop.deadline);
  expect(result.current.isFetching).toBe(true);
  expect(mockFetch).toHaveBeenCalledWith(loop.id);

  const detail = { ...loop, content: 'Send the updated deck', participants: [], events: [] };
  await act(async () => resolve(detail));
  await waitFor(() => expect(result.current.data).toEqual(detail));
});

it('does not use a different account or a different loop as a preview', () => {
  const { client, wrapper } = setup();
  client.setQueryData(['mobile-home-loops', 'another-user'], [loop]);
  client.setQueryData(['mobile-loops', 'user-1'], [{ ...loop, id: 'another-loop' }]);
  const { result } = renderHook(() => useLoopDetail('user-1', loop.id), { wrapper });
  expect(result.current.data).toBeUndefined();
  expect(result.current.isPending).toBe(true);
});

it('keeps an existing full detail response instead of replacing it with a list preview', () => {
  const { client, wrapper } = setup();
  const detail = { ...loop, content: 'Full detail', participants: [], events: [] };
  client.setQueryData(['loop-detail', loop.id], detail);
  client.setQueryData(['mobile-home-loops', 'user-1'], [loop]);
  const { result } = renderHook(() => useLoopDetail('user-1', loop.id), { wrapper });
  expect(result.current.data).toEqual(detail);
});

it.each([undefined, 408, 429, 503])('keeps saved details usable after a retryable refresh failure (%s)', async (status) => {
  const { client, wrapper } = setup();
  client.setQueryData(['mobile-home-loops', 'user-1'], [loop]);
  mockFetch.mockRejectedValue(Object.assign(new Error('Could not refresh'), { status }));
  const { result } = renderHook(() => useLoopDetail('user-1', loop.id), { wrapper });
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(result.current.data?.content).toBe('Send the deck');
  expect(result.current.hasUsableData).toBe(true);
  expect(result.current.refreshFailed).toBe(true);
});

it.each([401, 403, 404, 410])('does not present cached details as usable after a definitive denial (%s)', async (status) => {
  const { client, wrapper } = setup();
  client.setQueryData(['mobile-home-loops', 'user-1'], [loop]);
  mockFetch.mockRejectedValue(Object.assign(new Error('Unavailable'), { status }));
  const { result } = renderHook(() => useLoopDetail('user-1', loop.id), { wrapper });
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(result.current.hasUsableData).toBe(false);
  expect(result.current.refreshFailed).toBe(false);
});

it('still shows failure when neither cache nor network can supply the loop', async () => {
  const { wrapper } = setup();
  mockFetch.mockRejectedValue(new Error('Offline'));
  const { result } = renderHook(() => useLoopDetail('user-1', loop.id), { wrapper });
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(result.current.hasUsableData).toBe(false);
});

it('does not present saved details before the user is signed in', () => {
  const { client, wrapper } = setup();
  client.setQueryData(['loop-detail', loop.id], loop);
  const { result } = renderHook(() => useLoopDetail(undefined, loop.id), { wrapper });
  expect(result.current.hasUsableData).toBe(false);
  expect(mockFetch).not.toHaveBeenCalled();
});
