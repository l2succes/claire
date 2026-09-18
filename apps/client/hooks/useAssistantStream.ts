import { useCallback, useRef, useState } from 'react';
import {
  conversationAssistantApi,
  type AssistantStreamHandlers,
  type AssistantStreamPhase,
  type AssistantStreamResult,
} from '../services/conversationAssistant';

export type AssistantStreamTarget =
  | { kind: 'thread'; threadId: string; question: string; chatIds: string[]; requestId: string }
  | { kind: 'new'; question: string; chatIds: string[]; requestId: string }
  | { kind: 'conversation'; chatId: string; question: string; requestId: string };

/** Owns cancellation and phase state for both native and Electron Ask Claire surfaces. */
export function useAssistantStream() {
  const controllerRef = useRef<AbortController | null>(null);
  const [phase, setPhase] = useState<AssistantStreamPhase | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  const stop = useCallback(() => controllerRef.current?.abort(), []);

  const start = useCallback(async (
    target: AssistantStreamTarget,
    handlers: Omit<AssistantStreamHandlers, 'onPhase'> = {},
  ): Promise<AssistantStreamResult> => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setIsStreaming(true);
    setPhase('planning');
    const streamHandlers: AssistantStreamHandlers = { ...handlers, onPhase: setPhase };
    try {
      if (target.kind === 'thread') {
        return await conversationAssistantApi.streamAsk(target.threadId, target.question, target.chatIds, target.requestId, streamHandlers, controller.signal);
      }
      if (target.kind === 'new') {
        return await conversationAssistantApi.streamAskNew(target.question, target.chatIds, target.requestId, streamHandlers, controller.signal);
      }
      return await conversationAssistantApi.streamAskConversation(target.chatId, target.question, target.requestId, streamHandlers, controller.signal);
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setIsStreaming(false);
        setPhase(null);
      }
    }
  }, []);

  return { start, stop, isStreaming, phase };
}
