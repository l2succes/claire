import React from 'react';
import { AppState } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { MediaVideoPlayer } from '../features/chat/media-video-player';

const mockPlay = jest.fn();
const mockPause = jest.fn();
const mockRelease = jest.fn();
const mockReplace = jest.fn(() => Promise.resolve());
let mockStatusListener: (event: { status: string }) => void;
const mockPlayer = { play: mockPlay, pause: mockPause, release: mockRelease, replaceAsync: mockReplace, addListener: jest.fn((_name, listener) => { mockStatusListener = listener; return { remove: jest.fn() }; }) };
jest.mock('../features/chat/expo-video-module', () => ({ expoVideoModule: {
  useVideoPlayer: () => {
    const React = require('react');
    React.useEffect(() => () => mockRelease(), []);
    return mockPlayer;
  },
  VideoView: require('react-native').View,
} }));

describe('video playback lifecycle', () => {
  let background: (state: string) => void;
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => { background = listener as typeof background; return { remove: jest.fn() }; });
  });
  afterEach(() => jest.restoreAllMocks());
  it('loads on mount, reports failure, and recreates the player on retry', async () => {
    const screen = render(<MediaVideoPlayer uri="https://example.com/video" />);
    await act(async () => {});
    expect(mockReplace).toHaveBeenCalledWith({ uri: 'https://example.com/video' });
    expect(mockPlay).toHaveBeenCalledTimes(1);
    act(() => mockStatusListener({ status: 'error' }));
    expect(screen.getByText('Couldn’t play this video.')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByLabelText('Retry video')));
    expect(mockRelease).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledTimes(2);
    screen.unmount();
    expect(mockRelease).toHaveBeenCalledTimes(2);
  });
  it('pauses in the background and does not resume without another tap', async () => {
    render(<MediaVideoPlayer uri="https://example.com/video" />);
    await act(async () => {});
    act(() => background('background'));
    act(() => background('active'));
    expect(mockPause).toHaveBeenCalledTimes(1);
    expect(mockPlay).toHaveBeenCalledTimes(1);
  });
  it('does not start a slow load after the app has backgrounded', async () => {
    let finish!: () => void;
    mockReplace.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    render(<MediaVideoPlayer uri="https://example.com/video" />);
    act(() => background('background'));
    await act(async () => finish());
    expect(mockPlay).not.toHaveBeenCalled();
  });
});
