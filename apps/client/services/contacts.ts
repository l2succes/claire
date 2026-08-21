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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
  });
  const body = await response.json().catch(() => ({})) as { data?: T; error?: string };
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
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
