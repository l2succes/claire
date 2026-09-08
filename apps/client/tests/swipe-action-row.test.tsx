/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-var-requires */
import { Pressable, Text, View } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

const mockClose = jest.fn();

jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    SwipeDirection: { LEFT: 'left', RIGHT: 'right' },
    default: React.forwardRef(({ children, renderLeftActions, renderRightActions, testID }: any, ref: any) => {
      const methods = { close: mockClose, openLeft: jest.fn(), openRight: jest.fn(), reset: jest.fn() };
      React.useImperativeHandle(ref, () => methods);
      return (
        <View testID={testID}>
          {renderLeftActions?.({}, {}, methods)}
          {children}
          {renderRightActions?.({}, {}, methods)}
        </View>
      );
    }),
  };
});

import { SwipeActionRow } from '../components/mobile/swipe-action-row';

describe('SwipeActionRow', () => {
  beforeEach(() => mockClose.mockClear());

  it('exposes both action strips and closes before invoking an action', () => {
    const markRead = jest.fn();
    const snooze = jest.fn();
    const screen = render(
      <SwipeActionRow
        testID="row"
        leftActions={[{ id: 'read', label: 'Read', icon: <Text>✓</Text>, backgroundColor: '#fff', onPress: markRead }]}
        rightActions={[{ id: 'later', label: 'Later', icon: <Text>◷</Text>, backgroundColor: '#fff', onPress: snooze }]}
      >
        <Pressable><Text>Conversation</Text></Pressable>
      </SwipeActionRow>,
    );

    fireEvent.press(screen.getByTestId('swipe-action-read'));
    fireEvent.press(screen.getByTestId('swipe-action-later'));

    expect(mockClose).toHaveBeenCalledTimes(2);
    expect(markRead).toHaveBeenCalledTimes(1);
    expect(snooze).toHaveBeenCalledTimes(1);
  });

  it('renders the row without gesture chrome when disabled', () => {
    const screen = render(
      <SwipeActionRow
        enabled={false}
        leftActions={[{ id: 'read', label: 'Read', icon: <View />, backgroundColor: '#fff', onPress: jest.fn() }]}
      >
        <Text>Desktop row</Text>
      </SwipeActionRow>,
    );

    expect(screen.getByText('Desktop row')).toBeTruthy();
    expect(screen.queryByTestId('swipe-action-read')).toBeNull();
  });
});
