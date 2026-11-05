import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { InboxSearchAction } from '../features/inbox/inbox-search-action';
import { SearchScreen } from '../features/search/search-screen';
import { searchApi } from '../services/search';
import type { TextInputProps } from 'react-native';

jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useLocalSearchParams: jest.fn(() => ({})) }));
jest.mock('../stores/authStore', () => ({ useAuthStore: (selector: (state: { user: { id: string } }) => unknown) => selector({ user: { id: 'synthetic-user' } }) }));
jest.mock('../services/search', () => ({ searchApi: { exact: jest.fn(), answer: jest.fn() } }));
jest.mock('../components/PlatformIcon', () => ({ PlatformBadge: () => null }));
jest.mock('../components/claire/skeleton', () => ({ SearchResultsSkeleton: () => null }));
jest.mock('../components/mobile/claire-mobile', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Text, TextInput } = require('react-native') as typeof import('react-native');
  return {
    MobileHeader: ({ title, actions }: { title: string; actions?: React.ReactNode }) => <><Text>{title}</Text>{actions}</>,
    MobileSearchField: (props: TextInputProps) => <TextInput {...props} />,
    MobileState: ({ title }: { title: string }) => <Text>{title}</Text>,
    SectionLabel: () => null,
    MobileChip: () => null,
  };
});

const params = useLocalSearchParams as jest.Mock;
const exact = searchApi.exact as jest.Mock;
const answer = searchApi.answer as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  params.mockReturnValue({});
  exact.mockResolvedValue({ messages: [], people: [], loops: [], files: [], counts: {} });
  answer.mockResolvedValue({ answer: 'No matching evidence.', citations: [] });
});

function renderSearch() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return render(<SearchScreen />, { wrapper });
}

it('hides escalation for whitespace and submits the trimmed term only when tapped', () => {
  const onSearch = jest.fn();
  const screen = render(<InboxSearchAction query="   " onSearch={onSearch} />);
  expect(screen.queryByTestId('inbox-search-everything')).toBeNull();
  screen.rerender(<InboxSearchAction query="  renta  " onSearch={onSearch} />);
  expect(onSearch).not.toHaveBeenCalled();
  fireEvent.press(screen.getByTestId('inbox-search-everything'));
  expect(onSearch).toHaveBeenCalledWith('renta');
});

it('does not query while typing, then runs exact and AI search on submit', async () => {
  const screen = renderSearch();
  fireEvent.changeText(screen.getByTestId('global-search-input'), 'renta');
  expect(exact).not.toHaveBeenCalled();
  expect(answer).not.toHaveBeenCalled();
  fireEvent(screen.getByTestId('global-search-input'), 'submitEditing');
  await waitFor(() => expect(exact).toHaveBeenCalledWith('renta', 'everything'));
  expect(answer).toHaveBeenCalledTimes(1);
  expect(answer).toHaveBeenCalledWith('renta');
});

it('executes a route query on entry and accepts another query while mounted', async () => {
  params.mockReturnValue({ query: '  renta  ', searchRequestId: 'first' });
  const screen = renderSearch();
  await waitFor(() => expect(exact).toHaveBeenCalledWith('renta', 'everything'));
  expect(answer).toHaveBeenCalledTimes(1);
  fireEvent.press(screen.getByLabelText('Clear search'));
  expect(screen.getByTestId('global-search-input').props.value).toBe('');
  expect(answer).toHaveBeenCalledTimes(1);
  params.mockReturnValue({ query: 'renta', searchRequestId: 'second' });
  screen.rerender(<SearchScreen />);
  expect(screen.getByTestId('search-results-screen')).toBeTruthy();
  expect(answer).toHaveBeenCalledTimes(1); // Reuse the recent cached answer.
  params.mockReturnValue({ query: 'address' });
  screen.rerender(<SearchScreen />);
  await waitFor(() => expect(exact).toHaveBeenCalledWith('address', 'everything'));
  expect(answer).toHaveBeenCalledTimes(2);
});

it('does not execute an empty route query', async () => {
  params.mockReturnValue({ query: '   ' });
  renderSearch();
  await act(async () => {});
  expect(exact).not.toHaveBeenCalled();
  expect(answer).not.toHaveBeenCalled();
});
