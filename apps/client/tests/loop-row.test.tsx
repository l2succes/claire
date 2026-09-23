/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-var-requires */
import { render } from '@testing-library/react-native';
import type { LoopItem } from '../services/loop-types';

jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    SwipeDirection: { LEFT: 'left', RIGHT: 'right' },
    default: React.forwardRef(({ children, testID }: any, ref: any) => {
      React.useImperativeHandle(ref, () => ({ close: jest.fn() }));
      return <View testID={testID}>{children}</View>;
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
