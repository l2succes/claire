import React from 'react';
import { render } from '@testing-library/react-native';
import { MessageCard } from '../components/MessageCard';
import { Platform } from '../types/platform';

const baseMessage = {
  id: 'message-1',
  chat_name: 'Test Chat',
  content: 'Latest preview',
  timestamp: new Date(2026, 3, 23, 9, 5).toISOString(),
  from_me: false,
  is_group: false,
  chat_id: 'chat-1',
  platform: Platform.WHATSAPP,
};

describe('MessageCard', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 3, 23, 14, 35));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders the time of day for same-day messages', () => {
    const timestamp = new Date(2026, 3, 23, 9, 5);
    const { getByText } = render(
      <MessageCard message={{ ...baseMessage, timestamp: timestamp.toISOString() }} onPress={jest.fn()} />
    );

    expect(
      getByText(new Intl.DateTimeFormat('en-US', { timeStyle: 'short' }).format(timestamp))
    ).toBeTruthy();
  });

  it('renders Yesterday for previous-day messages', () => {
    const { getByText } = render(
      <MessageCard
        message={{ ...baseMessage, timestamp: new Date(2026, 3, 22, 23, 55).toISOString() }}
        onPress={jest.fn()}
      />
    );

    expect(getByText('Yesterday')).toBeTruthy();
  });

  it('renders the short weekday for messages from this week', () => {
    const timestamp = new Date(2026, 3, 20, 18, 20);
    const { getByText } = render(
      <MessageCard message={{ ...baseMessage, timestamp: timestamp.toISOString() }} onPress={jest.fn()} />
    );

    expect(
      getByText(new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(timestamp))
    ).toBeTruthy();
  });

  it('renders the short date for older messages', () => {
    const timestamp = new Date(2026, 3, 16, 8, 0);
    const { getByText } = render(
      <MessageCard message={{ ...baseMessage, timestamp: timestamp.toISOString() }} onPress={jest.fn()} />
    );

    expect(
      getByText(new Intl.DateTimeFormat('en-US', { dateStyle: 'short' }).format(timestamp))
    ).toBeTruthy();
  });
});
