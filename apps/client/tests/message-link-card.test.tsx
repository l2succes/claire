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

  it.each([
    ['Read https://en.wikipedia.org/wiki/Paris_(mythology).', 'https://en.wikipedia.org/wiki/Paris_(mythology)'],
    ['(https://example.com/a_(b_(c))).', 'https://example.com/a_(b_(c))'],
    ['[https://example.com/page]', 'https://example.com/page'],
    ['See https://example.com/list[1].', 'https://example.com/list[1]'],
  ])('preserves the destination in %s', (text, url) => {
    expect(extractMessageLinks(text).map((link) => link.url)).toEqual([url]);
  });

  it.each([
    ['https://docs.google.com/document/d/123', 'docs.google.com'],
    ['https://www.google.com/search?q=housing', 'google.com'],
    ['https://maps.google.com/?q=Paris', 'Google Maps'],
    ['https://www.google.com/maps/place/Paris', 'Google Maps'],
    ['https://www.youtube.com/watch?v=123', 'YouTube'],
    ['https://m.youtube.com/watch?v=123', 'YouTube'],
    ['https://youtube.com.example.org/watch?v=123', 'youtube.com.example.org'],
  ])('labels %s with its actual destination', (url, label) => {
    expect(extractMessageLinks(url)[0]?.label).toBe(label);
  });

  it('opens a balanced-parenthesis URL without truncating its path', () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const url = 'https://en.wikipedia.org/wiki/Paris_(mythology)';
    const screen = render(<MessageTextWithLinks text={`Read (${url}).`} fromMe={false} />);
    fireEvent.press(screen.getByTestId('message-link-preview'));
    expect(open).toHaveBeenCalledWith(url);
  });
});
