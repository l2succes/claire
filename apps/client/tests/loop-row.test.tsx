/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-var-requires */
import { fireEvent, render } from '@testing-library/react-native';
import type { LoopItem } from '../services/loop-types';

jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    SwipeDirection: { LEFT: 'left', RIGHT: 'right' },
    default: React.forwardRef(({ children, testID, renderLeftActions, renderRightActions }: any, ref: any) => {
      React.useImperativeHandle(ref, () => ({ close: jest.fn() }));
      const methods = { close: jest.fn() };
      return <View testID={testID}>{renderLeftActions?.(null, null, methods)}{children}{renderRightActions?.(null, null, methods)}</View>;
    }),
  };
});

import { LoopRow } from '../features/loops/loop-row';

function loop(overrides: Partial<LoopItem> = {}): LoopItem {
  return {
    id: 'loop-1',
    content: 'Send the deck',
    title: 'Send the deck',
    priority: 'high',
    status: 'open',
    from_me: true,
    owner: 'me',
    priority_score: 95,
    deadline: new Date(Date.now() - 86_400_000).toISOString(),
    ...overrides,
  } as LoopItem;
}

describe('LoopRow', () => {
  it('uses one compact deadline rail instead of duplicating urgency text', () => {
    const screen = render(
      <LoopRow item={loop()} onOpen={jest.fn()} onToggle={jest.fn()} />,
    );

    expect(screen.queryByText('ACT NOW')).toBeNull();
    expect(screen.getByTestId('loop-due-loop-1')).toBeTruthy();
    expect(screen.getByText(/OVERDUE/)).toBeTruthy();
  });

  it('does not reserve an empty trailing rail when there is no deadline', () => {
    const screen = render(
      <LoopRow item={loop({ deadline: null, priority_score: 95 })} onOpen={jest.fn()} onToggle={jest.fn()} />,
    );

    expect(screen.queryByTestId('loop-due-loop-1')).toBeNull();
    expect(screen.queryByText('ACT NOW')).toBeNull();
  });
});


describe('loop swipe actions', () => {
  it('routes Close, Waiting and Later to their handlers without opening the loop', () => {
    const onOpen = jest.fn();
    const onToggle = jest.fn();
    const onWait = jest.fn();
    const onSnooze = jest.fn();
    const screen = render(<LoopRow item={loop()} {...{ onOpen, onToggle, onWait, onSnooze }} />);
    fireEvent.press(screen.getByTestId('swipe-action-toggle-loop-loop-1'));
    fireEvent.press(screen.getByTestId('swipe-action-wait-loop-loop-1'));
    fireEvent.press(screen.getByTestId('swipe-action-later-loop-loop-1'));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onWait).toHaveBeenCalledTimes(1);
    expect(onSnooze).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('offers For me for waiting loops and only Reopen for closed loops', () => {
    const onToggle = jest.fn();
    const onWait = jest.fn();
    const screen = render(<LoopRow item={loop({ owner: 'them', status: 'waiting' })} onOpen={jest.fn()} onToggle={onToggle} onWait={onWait} onSnooze={jest.fn()} />);
    expect(screen.getByLabelText('For me')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('For me'));
    expect(onWait).toHaveBeenCalledTimes(1);
    screen.rerender(<LoopRow item={loop({ status: 'done' })} onOpen={jest.fn()} onToggle={onToggle} onWait={onWait} onSnooze={jest.fn()} />);
    fireEvent.press(screen.getByLabelText('Reopen'));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('swipe-action-wait-loop-loop-1')).toBeNull();
    expect(screen.queryByTestId('swipe-action-later-loop-loop-1')).toBeNull();
  });

  it('keeps the checkbox tap from opening the detail screen', () => {
    const onOpen = jest.fn();
    const onToggle = jest.fn();
    const stopPropagation = jest.fn();
    const screen = render(<LoopRow item={loop()} onOpen={onOpen} onToggle={onToggle} />);
    fireEvent.press(screen.getByTestId('loop-toggle-loop-1'), { stopPropagation });
    expect(stopPropagation).toHaveBeenCalled();
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });
});
