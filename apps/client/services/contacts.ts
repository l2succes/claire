import { supabase } from './supabase';
import { API_BASE_URL } from './platforms';
import type { Platform } from '../types/platform';

export type PeopleFilter = 'all' | 'contacted' | 'needs_context' | 'groups';

export interface PersonContact {
  id: string;
  name: string | null;
  phone_number: string | null;
  avatar_url?: string | null;
  inferred_name?: string | null;
  inferred_relationship?: string | null;
  is_group: boolean;
  platform?: Platform | null;
  username?: string | null;
  chat?: {
    id: string;
    name: string | null;
    platform: Platform | null;
    is_group: boolean;
    last_message_at: string | null;
  } | null;
}

interface PeoplePage {
  contacts: PersonContact[];
  nextOffset: number | null;
}

/**
 * The directory is a large response, so give it a generous ceiling — but a
 * ceiling. fetch has no timeout of its own: a stalled request stays pending
 * forever, the query never settles, and People renders its skeleton
 * indefinitely with no way to reach the error state that already exists on the
 * list. A request that cannot finish should fail and say so.
 */
const REQUEST_TIMEOUT_MS = 30_000;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
    });
  } catch (cause) {
    if (controller.signal.aborted) throw new Error('People took too long to load. Try again.');
    throw cause;
  } finally {
    clearTimeout(timeout);
  }
  const body = await response.json().catch(() => ({})) as { data?: T; error?: string };
  // Server text is written for logs and can carry database detail, so only the
  // status decides what the person is told.
  if (!response.ok) {
    throw new Error(
      response.status >= 500
        ? 'People are unavailable right now. Try again in a moment.'
        : body.error || `Could not load People (${response.status}).`,
    );
  }
  if (!body.data) throw new Error('People request returned no data');
  return body.data;
}

export const contactsApi = {
  list({ offset = 0, limit = 80, query, platform, filter }: {
    offset?: number;
    limit?: number;
    query: string;
    platform: 'all' | Platform;
    filter: PeopleFilter;
  }) {
    const params = new URLSearchParams({
      offset: String(offset),
      limit: String(limit),
      platform,
      filter,
    });
    if (query.trim()) params.set('q', query.trim());
    return request<PeoplePage>(`/contacts?${params.toString()}`);
  },
  startIdentitySync() {
    return request<{ status: 'started' }>('/contacts/identity-backfill', { method: 'POST' });
  },
};
