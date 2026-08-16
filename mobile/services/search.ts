import { supabase } from './supabase';
import { API_BASE_URL } from './platforms';
import type { AssistantCitation, AssistantIndexStatus } from './conversationAssistant';

export type SearchScope = 'everything' | 'messages' | 'people' | 'files' | 'promises';
export interface SearchMessageResult { id: string; chat_id: string; content: string; timestamp: string; platform?: string; contact_name?: string; from_me: boolean; chat?: { name?: string; is_group?: boolean } | null; contact?: { name?: string; inferred_name?: string; avatar_url?: string } | null }
export interface SearchPersonResult { id: string; name?: string; inferred_name?: string; phone_number?: string; avatar_url?: string; platform?: string; is_group?: boolean }
export interface SearchPromiseResult { id: string; content: string; deadline?: string; status: string; chat_id?: string; chat?: { name?: string; is_group?: boolean; platform?: string } | null }
export interface SearchFileResult { id: string; chat_id: string; content?: string; content_type?: string; media_mime_type?: string; timestamp: string; platform?: string; contact_name?: string; chat?: { name?: string; is_group?: boolean } | null }
export interface UnifiedSearchResults { query: string; scope: SearchScope; messages: SearchMessageResult[]; people: SearchPersonResult[]; promises: SearchPromiseResult[]; files: SearchFileResult[]; counts: Record<'messages' | 'people' | 'promises' | 'files', number> }
export interface SemanticSearchAnswer { answer: string; citations: AssistantCitation[]; indexing: AssistantIndexStatus }

async function request<T>(path: string, init: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}), ...init.headers } });
  const body = await response.json().catch(() => ({})) as { data?: T; error?: string };
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body.data as T;
}

export const searchApi = {
  exact: (query: string, scope: SearchScope) => request<UnifiedSearchResults>(`/search?q=${encodeURIComponent(query)}&scope=${scope}&limit=20`),
  answer: (query: string) => request<SemanticSearchAnswer>('/ai/search', { method: 'POST', body: JSON.stringify({ query }) }),
};
