import { act, renderHook } from '@testing-library/react-native';
import { useChatMediaViewer } from '../hooks/useChatMediaViewer';
import type { ChatMessage } from '@claire/chat-core';

jest.mock('../services/platforms', () => ({ API_BASE_URL: 'https://api.example.com' }));
const message: ChatMessage = { id: 'photo', content: '', timestamp: '2026-09-24', from_me: false, content_type: 'image', media_url: 'mxc://matrix/image' };

describe('chat media viewer selection', () => {
  it('opens the original source, stops voice, and dismisses without losing the message', () => {
    const stopVoice = jest.fn();
    const { result } = renderHook(() => useChatMediaViewer('chat-one', stopVoice));
    act(() => result.current.open(message));
    expect(result.current.media?.uri).toBe('https://api.example.com/media/matrix/image');
    expect(result.current.message).toBe(message);
    expect(stopVoice).toHaveBeenCalledTimes(1);
    act(() => result.current.close());
    expect(result.current.media).toBeNull();
    expect(message.media_url).toBe('mxc://matrix/image');
  });
  it('closes immediately when switching chats', () => {
    const stopVoice = jest.fn();
    const { result, rerender } = renderHook(({ chatId }) => useChatMediaViewer(chatId, stopVoice), { initialProps: { chatId: 'chat-one' } });
    act(() => result.current.open(message));
    rerender({ chatId: 'chat-two' });
    expect(result.current.media).toBeNull();
  });
});
