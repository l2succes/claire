import { useCallback, useEffect, useState } from 'react';
import { Keyboard } from 'react-native';
import { type ChatMessage, visualMediaForMessage } from '@claire/chat-core';
import { API_BASE_URL } from '../services/platforms';

export function useChatMediaViewer(chatId: string, stopVoice: () => void) {
  const [selection, setSelection] = useState<{ chatId: string; message: ChatMessage } | null>(null);
  const close = useCallback(() => setSelection(null), []);
  useEffect(close, [chatId, close]);
  const open = useCallback((message: ChatMessage) => {
    if (!visualMediaForMessage(message, API_BASE_URL)) return;
    Keyboard.dismiss();
    stopVoice();
    setSelection({ chatId, message });
  }, [chatId, stopVoice]);
  const message = selection?.chatId === chatId ? selection.message : null;
  return { message, media: message ? visualMediaForMessage(message, API_BASE_URL) : null, open, close };
}
