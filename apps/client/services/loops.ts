/**
 * The loops API, in one place.
 *
 * Both the list and the detail screen used to inline their own fetch and their
 * own row shape, which is how the list and detail endpoints drifted apart. One
 * module, one set of types.
 */

import { supabase } from './supabase';
import { API_BASE_URL } from './platforms';
import type { LoopDetail, LoopItem } from './loop-types';

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

export function updateLoop(id: string, patch: Partial<Pick<LoopItem,
  'status' | 'notes' | 'deadline' | 'priority' | 'content'>>): Promise<LoopItem> {
  return request<LoopItem>(`/loops/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
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

export function deleteLoop(id: string): Promise<void> {
  return request<void>(`/loops/${id}`, { method: 'DELETE' });
}

export * from './loop-types';
export * from './loop-display';
