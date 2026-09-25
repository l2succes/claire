import { fireEvent, render } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { extractMessageLinks, MessageTextWithLinks } from '../features/chat/message-link-card';

describe('message link cards', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('extracts safe links, trims punctuation, and labels Maps links', () => {
    expect(extractMessageLinks('Meet here: https://maps.app.goo.gl/abc123.')).toEqual([
      {
        url: 'https://maps.app.goo.gl/abc123',
        host: 'maps.app.goo.gl',
        label: 'Google Maps',
      },
    ]);
    expect(extractMessageLinks('javascript:alert(1)')).toEqual([]);
  });

  it('renders a native link action and opens the exact URL', () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const screen = render(
      <MessageTextWithLinks text="Directions https://maps.app.goo.gl/abc123" fromMe={false} />,
    );

    fireEvent.press(screen.getByTestId('message-link-preview'));
    expect(screen.getByText('Google Maps')).toBeTruthy();
    expect(open).toHaveBeenCalledWith('https://maps.app.goo.gl/abc123');
  });
});
