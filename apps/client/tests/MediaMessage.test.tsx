import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { MediaMessage } from '../features/chat/media-message';
import type { ChatMessage, VisualMedia } from '@claire/chat-core';

jest.mock('expo-image', () => ({ Image: require('react-native').Image }));
const message: ChatMessage = { id: 'photo', content: '', timestamp: '2026-09-24T10:00:00Z', from_me: false };
const media: VisualMedia = { messageId: 'photo', kind: 'image', uri: 'https://example.com/photo', width: 600, height: 400 };

describe('media message layout', () => {
  it('fits the image itself without card padding and overlays a readable timestamp', () => {
    const screen = render(<MediaMessage media={media} message={message} maxWidth={300} sender="Test sender" />);
    expect(screen.getByTestId('media-preview-photo')).toHaveStyle({ width: 300, height: 200, overflow: 'hidden' });
    expect(screen.getByTestId('media-message-photo')).toHaveStyle({ width: 300 });
    expect(screen.getByTestId('media-time-photo')).toHaveStyle({ position: 'absolute', color: 'white' });
    expect(screen.getByText('Test sender')).toBeTruthy();
  });
  it('keeps real captions outside the preview', () => {
    const screen = render(<MediaMessage media={media} message={{ ...message, content: 'A room with a view', from_me: true }} maxWidth={300} />);
    expect(screen.getByText('A room with a view')).toBeTruthy();
    expect(screen.queryByTestId('media-time-photo')).toBeNull();
  });
  it('uses loaded dimensions when old messages have no metadata', () => {
    const screen = render(<MediaMessage media={{ ...media, width: undefined, height: undefined }} message={message} maxWidth={300} />);
    fireEvent(screen.getByTestId('media-image-photo-image'), 'load', { source: { width: 100, height: 200 } });
    expect(screen.getByTestId('media-preview-photo')).toHaveStyle({ width: 210, height: 420 });
  });
  it('renders a video poster without mounting a player', () => {
    const screen = render(<MediaMessage media={{ ...media, kind: 'video', durationMs: 15_000 }} message={message} maxWidth={300} />);
    expect(screen.getByText('0:15')).toBeTruthy();
    expect(screen.queryByTestId('media-viewer-video')).toBeNull();
  });
  it('keeps a failed image sized and lets retry reset its loading state', () => {
    const screen = render(<MediaMessage media={media} message={message} maxWidth={300} />);
    fireEvent(screen.getByTestId('media-image-photo-image'), 'error');
    expect(screen.getByTestId('media-preview-photo')).toHaveStyle({ width: 300, height: 200 });
    const stopPropagation = jest.fn();
    fireEvent.press(screen.getByLabelText('Retry image'), { stopPropagation });
    expect(stopPropagation).toHaveBeenCalled();
    expect(screen.getByLabelText('Loading image')).toBeTruthy();
  });
});
