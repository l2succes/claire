import { API_BASE_URL } from './platforms';
import { authenticatedFetch } from './authenticated-fetch';
import { authenticatedExpoFetch } from './authenticated-fetch';
import { clientSafeMessage } from './api-errors';
import { parseAssistantSseEvent } from './assistant-stream-protocol';

export interface AssistantCitation {
  messageId: string;
  chatId: string;
  excerpt: string;
  senderName: string;
  fromMe: boolean;
  timestamp: string;
  platform: string;
  chatName: string | null;
  isGroup: boolean;
  isPreferredScope?: boolean;
}

export interface AssistantAction {
  type: 'open_conversation' | 'open_calendar';
  label: string;
  chatId?: string;
  chatName?: string | null;
  platform?: string;
  isGroup?: boolean;
  title?: string;
  startsAt?: string;
}

export interface AssistantThread {
  id: string;
  title: string;
  chat_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssistantTurn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: AssistantCitation[];
  actions?: AssistantAction[];
  scope_chat_ids?: string[];
  status?: 'pending' | 'streaming' | 'completed' | 'failed' | 'cancelled';
  request_id?: string | null;
  created_at: string;
}

export interface AssistantMentionCandidate {
  id: string;
  name: string;
  platform: string;
  is_group: boolean;
}

export interface AssistantIndexStatus {
  status: 'idle' | 'indexing' | 'ready' | 'failed';
  indexedCount: number;
  totalCount: number;
  lastIndexedAt: string | null;
  lastError: string | null;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await authenticatedFetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  const body = (await response.json().catch(() => ({}))) as { data?: T; error?: string };
  if (!response.ok) {
    throw new Error(clientSafeMessage({ response: { status: response.status, data: body } }));
  }
  return body.data as T;
}

export type AssistantStreamPhase = 'planning' | 'reading' | 'saving';

export interface AssistantStreamResult {
  answer: string;
  citations: AssistantCitation[];
  actions: AssistantAction[];
  indexing: AssistantIndexStatus;
  requestId: string;
  assistantTurn?: AssistantTurn;
  thread?: AssistantThread;
}

export interface AssistantStreamHandlers {
  onDelta?: (delta: string) => void;
  onPhase?: (phase: AssistantStreamPhase) => void;
}

async function streamRequest(
  path: string,
  body: { question: string; chatIds?: string[]; requestId: string },
  handlers: AssistantStreamHandlers,
  signal?: AbortSignal
): Promise<AssistantStreamResult> {
  const response = await authenticatedExpoFetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ ...body, stream: true }),
    signal,
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(clientSafeMessage({ response: { status: response.status, data: errorBody } }));
  }
  if (!response.body) throw new Error('Claire opened a response but no stream was available.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result: AssistantStreamResult | null = null;
  const consumeEvent = (event: string) => {
    const chunk = parseAssistantSseEvent(event);
    if (!chunk) return;
    if (chunk.type === 'text-delta' && typeof chunk.delta === 'string')
      handlers.onDelta?.(chunk.delta);
    if (chunk.type === 'data-claire-status') {
      const phase = (chunk.data as { phase?: AssistantStreamPhase } | undefined)?.phase;
      if (phase) handlers.onPhase?.(phase);
    }
    if (chunk.type === 'data-claire-result') result = chunk.data as AssistantStreamResult;
    if (chunk.type === 'error')
      throw new Error(chunk.errorText || 'Claire could not finish that answer.');
  };

  let streamComplete = false;
  while (!streamComplete) {
    const { done, value } = await reader.read();
    streamComplete = done;
    buffer += decoder.decode(value, { stream: !streamComplete });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() || '';
    for (const event of events) consumeEvent(event);
  }
  if (buffer.trim()) consumeEvent(buffer);
  if (!result)
    throw new Error(
      signal?.aborted ? 'Answer stopped.' : 'Claire’s response ended before it was saved.'
    );
  return result;
}

export const conversationAssistantApi = {
  listThreads: () => request<AssistantThread[]>('/ai/assistant/threads'),
  createThread: (title?: string) =>
    request<AssistantThread>('/ai/assistant/threads', {
      method: 'POST',
      body: JSON.stringify(title ? { title } : {}),
    }),
  getThread: (threadId: string) =>
    request<{ thread: AssistantThread; turns: AssistantTurn[] }>(
      `/ai/assistant/threads/${encodeURIComponent(threadId)}`
    ),
  deleteThread: (threadId: string) =>
    request<void>(`/ai/assistant/threads/${encodeURIComponent(threadId)}`, { method: 'DELETE' }),
  ask: (threadId: string, question: string, chatIds: string[] = []) =>
    request<{
      answer: string;
      citations: AssistantCitation[];
      actions: AssistantAction[];
      indexing: AssistantIndexStatus;
    }>(`/ai/assistant/threads/${encodeURIComponent(threadId)}/messages`, {
      method: 'POST',
      body: JSON.stringify({ question, chatIds }),
    }),
  streamAsk: (
    threadId: string,
    question: string,
    chatIds: string[],
    requestId: string,
    handlers: AssistantStreamHandlers,
    signal?: AbortSignal
  ) =>
    streamRequest(
      `/ai/assistant/threads/${encodeURIComponent(threadId)}/messages`,
      { question, chatIds, requestId },
      handlers,
      signal
    ),
  streamAskNew: (
    question: string,
    chatIds: string[],
    requestId: string,
    handlers: AssistantStreamHandlers,
    signal?: AbortSignal
  ) => streamRequest('/ai/assistant/messages', { question, chatIds, requestId }, handlers, signal),
  mentionCandidates: (query: string) =>
    request<AssistantMentionCandidate[]>(
      `/ai/assistant/mention-candidates?q=${encodeURIComponent(query)}`
    ),
  getIndexStatus: () => request<AssistantIndexStatus>('/ai/assistant/index/status'),
  startIndex: () => request<AssistantIndexStatus>('/ai/assistant/index', { method: 'POST' }),
  getConversation: async (chatId: string) => {
    try {
      return await request<{ thread: AssistantThread; turns: AssistantTurn[] }>(
        `/ai/assistant/conversations/${encodeURIComponent(chatId)}`
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes('no saved thread')) return null;
      throw error;
    }
  },
  askConversation: (chatId: string, question: string) =>
    request<{
      thread: AssistantThread;
      turns: AssistantTurn[];
      answer: string;
      citations: AssistantCitation[];
      actions: AssistantAction[];
      indexing: AssistantIndexStatus;
    }>(`/ai/assistant/conversations/${encodeURIComponent(chatId)}/messages`, {
      method: 'POST',
      body: JSON.stringify({ question }),
    }),
  streamAskConversation: (
    chatId: string,
    question: string,
    requestId: string,
    handlers: AssistantStreamHandlers,
    signal?: AbortSignal
  ) =>
    streamRequest(
      `/ai/assistant/conversations/${encodeURIComponent(chatId)}/messages`,
      { question, requestId },
      handlers,
      signal
    ),
  clearConversation: (chatId: string) =>
    request<void>(`/ai/assistant/conversations/${encodeURIComponent(chatId)}`, {
      method: 'DELETE',
    }),
};
