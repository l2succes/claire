/**
 * The loops API, in one place.
 *
 * Both the list and the detail screen used to inline their own fetch and their
 * own row shape, which is how the list and detail endpoints drifted apart. One
 * module, one set of types.
 */

import { API_BASE_URL } from './platforms';
import { authenticatedFetch } from './authenticated-fetch';
import type { LoopAgentResult, LoopDetail, LoopItem, LoopReviewInput } from './loop-types';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await authenticatedFetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  const body = (await response.json().catch(() => ({}))) as { data?: T; error?: string };
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body.data as T;
}

export function fetchLoops(limit = 200): Promise<LoopItem[]> {
  return request<LoopItem[]>(`/loops?limit=${limit}`);
}

/** The details-page call. Timeline and participants are opt-in server-side. */
export function fetchLoopDetail(id: string): Promise<LoopDetail> {
  return request<LoopDetail>(`/loops/${id}?include=events,participants`);
}

export function createLoop(content: string): Promise<LoopItem> {
  return request<LoopItem>('/loops', {
    method: 'POST',
    body: JSON.stringify({ content, priority: 'medium' }),
  });
}

export function updateLoop(id: string, patch: Partial<Pick<LoopItem,
  'status' | 'owner' | 'notes' | 'deadline' | 'priority' | 'content'>>, expectedVersion?: number): Promise<LoopItem> {
  return request<LoopItem>(`/loops/${id}`, { method: 'PATCH', body: JSON.stringify({ ...patch, ...(expectedVersion !== undefined ? { expected_version: expectedVersion } : {}) }) });
}

/**
 * Snooze writes `snoozed_until` only. It must never touch `deadline` — that is
 * the date the user actually committed to, and overwriting it (as this endpoint
 * once did) destroys it.
 */
export function snoozeLoop(id: string, until: string): Promise<LoopItem> {
  return request<LoopItem>(`/loops/${id}/snooze`, {
    method: 'POST',
    body: JSON.stringify({ snooze_until: until }),
  });
}

/**
 * Ask the loop-scoped agent a question.
 *
 * Whatever comes back is inert: the agent has no tool that sends a message or
 * writes externally, so a draft or proposal here is only ever a suggestion.
 */
export function askLoopAgent(id: string, question: string): Promise<LoopAgentResult> {
  return request<LoopAgentResult>(`/loops/${id}/agent/messages`, {
    method: 'POST',
    body: JSON.stringify({ question }),
  });
}

export function deleteLoop(id: string): Promise<void> {
  return request<void>(`/loops/${id}`, { method: 'DELETE' });
}

/**
 * Record a deliberate stale-loop or close-suggestion decision. Unlike a local
 * hide, this persists “keep open” so the same review does not reappear until
 * the conversation adds new evidence.
 */
export function reviewLoop(id: string, input: LoopReviewInput): Promise<LoopItem> {
  return request<LoopItem>(`/loops/${id}/review`, {
    method: 'POST',
    body: JSON.stringify({
      action: input.action,
      resolution: input.resolution,
      suggestion_event_id: input.suggestionEventId,
    }),
  });
}

export * from './loop-types';
export * from './loop-display';

export interface LoopAttentionItem {
  loop_id: string;
  row_version: number;
  reason: string;
  next_action: string;
  due_at: string;
  loop: LoopItem;
}

export function fetchLoopAttention(): Promise<LoopAttentionItem[]> {
  return request<LoopAttentionItem[]>('/loops/attention');
}

export interface LoopHealth {
  detectionMode: string;
  shadow: boolean;
  notificationsEnabled: boolean;
  enabledDevices: number;
  dirtyChats: number;
  oldestDirtyAt: string | null;
  preferences: { detectionEnabled: boolean; aiEnabled: boolean; notificationsEnabled: boolean; notifyLoops: boolean } | null;
}
export function fetchLoopHealth(): Promise<LoopHealth> {
  return request<LoopHealth>('/loops/health');
}
