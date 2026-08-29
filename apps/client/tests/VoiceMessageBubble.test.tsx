import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockPlayer = {
  play: jest.fn(),
  pause: jest.fn(),
  seekTo: jest.fn(() => Promise.resolve()),
};
let mockStatus = {
  currentTime: 0,
  duration: 12,
  playing: false,
  didJustFinish: false,
  isBuffering: false,
  isLoaded: true,
  playbackState: 'readyToPlay',
};
const mockUseAudioPlayer = jest.fn((_source?: unknown, _options?: unknown) => mockPlayer);
const mockSetAudioModeAsync = jest.fn((_mode?: unknown) => Promise.resolve());

jest.mock('expo-audio', () => ({
  useAudioPlayer: (source: unknown, options: unknown) => mockUseAudioPlayer(source, options),
  useAudioPlayerStatus: () => mockStatus,
  setAudioModeAsync: (mode: unknown) => mockSetAudioModeAsync(mode),
}));

import { VoiceMessageBubble } from '../features/chat/voice-message-bubble';

const baseProps = {
  uri: 'https://example.test/voice.m4a',
  messageId: 'voice-1',
  durationMs: 12_000,
  waveform: [10, 80, 200, 40],
  onActivate: jest.fn(),
  onDeactivate: jest.fn(),
};

describe('VoiceMessageBubble', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStatus = {
      currentTime: 0,
      duration: 12,
      playing: false,
      didJustFinish: false,
      isBuffering: false,
      isLoaded: true,
      playbackState: 'readyToPlay',
    };
  });

  it('shows metadata without loading audio until playback is requested', () => {
    const { getByText, getByLabelText } = render(
      <VoiceMessageBubble {...baseProps} active={false} />,
    );

    expect(getByText('0:12')).toBeTruthy();
    expect(mockUseAudioPlayer).not.toHaveBeenCalled();
    fireEvent.press(getByLabelText('Play voice message'));
    expect(baseProps.onActivate).toHaveBeenCalledTimes(1);
  });

  it('loads download-first, resets the audio session, and seeks through the waveform', async () => {
    mockStatus = { ...mockStatus, currentTime: 6, playing: true };
    const { getByLabelText } = render(<VoiceMessageBubble {...baseProps} active />);

    await waitFor(() => expect(mockPlayer.play).toHaveBeenCalled());
    expect(mockUseAudioPlayer).toHaveBeenCalledWith(baseProps.uri, {
      downloadFirst: true,
      updateInterval: 100,
    });
    expect(mockSetAudioModeAsync).toHaveBeenCalledWith({
      playsInSilentMode: true,
      allowsRecording: false,
    });

    fireEvent(getByLabelText(/Voice note waveform/), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    expect(mockPlayer.seekTo).toHaveBeenCalledWith(6.6000000000000005);
  });

  it('waits for a remote source to finish loading before the initial play', async () => {
    // downloadFirst begins with an empty player which can report loaded but has
    // no source duration yet.
    mockStatus = { ...mockStatus, duration: 0, isLoaded: true, isBuffering: false };
    const view = render(<VoiceMessageBubble {...baseProps} active />);
    await waitFor(() => expect(mockSetAudioModeAsync).toHaveBeenCalled());
    expect(mockPlayer.play).not.toHaveBeenCalled();

    mockStatus = { ...mockStatus, duration: 12, isLoaded: true, isBuffering: false };
    view.rerender(<VoiceMessageBubble {...baseProps} active />);
    await waitFor(() => expect(mockPlayer.play).toHaveBeenCalledTimes(1));
  });

  it('resets on completion and offers retry for a failed source', async () => {
    mockStatus = { ...mockStatus, didJustFinish: true };
    const completed = render(<VoiceMessageBubble {...baseProps} active />);
    await waitFor(() => expect(mockPlayer.seekTo).toHaveBeenCalledWith(0));
    expect(baseProps.onDeactivate).toHaveBeenCalledTimes(1);
    completed.unmount();

    jest.clearAllMocks();
    mockStatus = { ...mockStatus, didJustFinish: false, playbackState: 'failed' };
    const failed = render(<VoiceMessageBubble {...baseProps} active />);
    const callsBeforeRetry = mockUseAudioPlayer.mock.calls.length;
    fireEvent.press(failed.getByLabelText('Retry voice note'));
    await act(async () => undefined);
    expect(mockUseAudioPlayer.mock.calls.length).toBeGreaterThan(callsBeforeRetry);
  });

  it('renders the uniform progress fallback when older metadata has no waveform', () => {
    const { getByLabelText } = render(
      <VoiceMessageBubble {...baseProps} waveform={undefined} active={false} />,
    );
    expect(getByLabelText(/Voice note waveform/)).toBeTruthy();
  });
});
