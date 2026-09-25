import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { MessageSendFailure } from '../features/chat/message-send-failure';

describe('MessageSendFailure', () => {
  it('keeps retry attached to the failed message', () => {
    const onRetry = jest.fn();
    const view = render(<MessageSendFailure messageId="local-1" onRetry={onRetry} />);

    fireEvent.press(view.getByLabelText('Message failed to send. Retry'));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(view.getByTestId('message-retry-local-1')).toBeTruthy();
  });
});
