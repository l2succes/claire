import { supabase } from './supabase';
import { API_BASE_URL } from './platforms';

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
}

export interface AssistantThread {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface AssistantTurn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: AssistantCitation[];
  created_at: string;
}

export interface AssistantIndexStatus {
  status: 'idle' | 'indexing' | 'ready' | 'failed';
  indexedCount: number;
  totalCount: number;
  lastIndexedAt: string | null;
  lastError: string | null;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => ({})) as { data?: T; error?: string };
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body.data as T;
}

export const conversationAssistantApi = {
  listThreads: () => request<AssistantThread[]>('/ai/assistant/threads'),
  createThread: (title?: string) => request<AssistantThread>('/ai/assistant/threads', {
    method: 'POST', body: JSON.stringify(title ? { title } : {}),
  }),
  getThread: (threadId: string) => request<{ thread: AssistantThread; turns: AssistantTurn[] }>(`/ai/assistant/threads/${encodeURIComponent(threadId)}`),
  deleteThread: (threadId: string) => request<void>(`/ai/assistant/threads/${encodeURIComponent(threadId)}`, { method: 'DELETE' }),
  ask: (threadId: string, question: string) => request<{ answer: string; citations: AssistantCitation[]; indexing: AssistantIndexStatus }>(
    `/ai/assistant/threads/${encodeURIComponent(threadId)}/messages`,
    { method: 'POST', body: JSON.stringify({ question }) },
  ),
  getIndexStatus: () => request<AssistantIndexStatus>('/ai/assistant/index/status'),
  startIndex: () => request<AssistantIndexStatus>('/ai/assistant/index', { method: 'POST' }),
};
