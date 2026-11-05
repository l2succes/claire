import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LoopDetailScreen } from '../features/loops/loop-detail-screen';
import { fetchLoopDetail, LoopRequestError, type LoopDetail } from '../services/loops';

jest.mock('../services/loops', () => ({
  ...jest.requireActual('../services/loops'), fetchLoopDetail: jest.fn(),
}));
jest.mock('../stores/authStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { id: 'user-1' } }),
}));
jest.mock('../hooks/useInAppNotifications', () => ({
  markInAppLoopRead: jest.fn(async () => undefined), notificationFeedKey: () => ['notifications'],
}));
jest.mock('../features/loops/loop-agent-panel', () => ({ LoopAgentPanel: () => null }));
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: jest.requireActual('react-native').View },
  useSharedValue: (value: unknown) => ({ value }),
  useAnimatedStyle: (style: () => unknown) => style(),
  withTiming: (value: unknown) => value,
}));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() }, useLocalSearchParams: () => ({ id: 'loop-1' }),
}));

const mockFetch = jest.mocked(fetchLoopDetail);
const saved: LoopDetail = { id: 'loop-1', title: 'Saved loop', content: 'Send the deck',
  status: 'open', priority: 'high', from_me: true };

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  client.setQueryData(['mobile-home-loops', 'user-1'], [saved]);
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <QueryClientProvider client={client}><LoopDetailScreen /></QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => mockFetch.mockReset());

it('keeps the saved loop on screen after a failed refresh and retries successfully', async () => {
  mockFetch.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce({ ...saved, title: 'Fresh loop' });
  const screen = renderScreen();
  await waitFor(() => expect(screen.getByTestId('loop-detail-refresh-error')).toBeTruthy());
  expect(screen.getByTestId('loop-detail-title')).toHaveTextContent('Saved loop');
  expect(screen.queryByText('Could not open this loop')).toBeNull();
  fireEvent.press(screen.getByTestId('loop-detail-retry'));
  await waitFor(() => expect(screen.getByTestId('loop-detail-title')).toHaveTextContent('Fresh loop'));
  expect(screen.queryByTestId('loop-detail-refresh-error')).toBeNull();
});

it('shows the unavailable state when the server confirms deletion despite a saved preview', async () => {
  mockFetch.mockRejectedValue(new LoopRequestError('Loop not found', 404));
  const screen = renderScreen();
  await waitFor(() => expect(screen.getByText('Could not open this loop')).toBeTruthy());
  expect(screen.queryByTestId('loop-detail-title')).toBeNull();
  expect(screen.queryByTestId('loop-detail-refresh-error')).toBeNull();
});
