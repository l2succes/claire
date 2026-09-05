import React from 'react';
import { render } from '@testing-library/react-native';
import { colors } from '@claire/design-system';
import { StandaloneEmojiMessage } from '../features/chat/standalone-emoji-message';

describe('StandaloneEmojiMessage', () => {
  it('renders one native emoji at large size with an outgoing lime timestamp badge', () => {
    const { getByTestId } = render(
      <StandaloneEmojiMessage
        messageId="emoji-out"
        content="  👍🏽  "
        timestamp="2026-08-29T11:00:00.000Z"
        fromMe
      />,
    );

    expect(getByTestId('standalone-emoji-emoji-out')).toHaveTextContent('👍🏽');
    expect(getByTestId('standalone-emoji-emoji-out')).toHaveStyle({ fontSize: 52 });
    expect(getByTestId('standalone-emoji-time-emoji-out')).toHaveStyle({
      backgroundColor: colors.lime,
    });
  });

  it('uses the paper timestamp badge for incoming emoji', () => {
    const { getByTestId } = render(
      <StandaloneEmojiMessage
        messageId="emoji-in"
        content="😢"
        timestamp="2026-08-29T11:00:00.000Z"
        fromMe={false}
      />,
    );

    expect(getByTestId('standalone-emoji-time-emoji-in')).toHaveStyle({
      backgroundColor: colors.paper,
    });
  });
});
