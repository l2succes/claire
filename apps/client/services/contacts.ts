import { supabase } from './supabase';
import { API_BASE_URL } from './platforms';
import type { Platform } from '../types/platform';

export type PeopleFilter = 'all' | 'contacted' | 'needs_context' | 'groups';

export interface PersonContact {
  id: string;
  /** What the user has told Claire about this person. Feeds the prompt builder. */
  notes?: string | null;
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
      // Merge, never replace: a caller sending a body supplies its own
      // Content-Type, and overwriting the whole object silently dropped it,
      // which the server then reads as an empty body.
      headers: {
        ...(init?.headers as Record<string, string> | undefined),
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
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

/**
 * How many contacts to ask for per request.
 *
 * People needs the whole directory in memory for its A-Z index, but asking for
 * all of it in one call meant a 10,000-row request that the API answered with a
 * 500. Walk it in pages instead: each one is a small, ordinary request, and the
 * screen is fed from the local cache anyway, so the walk happens in the
 * background rather than in front of the user.
 *
 * The size is measured, not guessed, and it has moved once. It was 150 while the
 * route still resolved each returned contact's chat with a single unbounded
 * `.in()` over the page's ids: PostgREST puts filters in the URL at roughly 40
 * bytes per UUID, so anything larger produced a querystring the gateway
 * rejected. That is fixed and deployed — the route chunks the lookup at 100
 * internally now — so the client no longer has to keep its pages tiny.
 *
 * It matters because this directory is far larger than the screen was designed
 * for: this account has 21,366 contacts. At 150 a page that was 143 sequential
 * round trips, and the old MAX_PAGES guard silently cut it off at 6,000 — so
 * People spent tens of seconds loading and then showed a quarter of the
 * directory with no indication anything was missing.
 */
const PAGE_SIZE = 1000;

/**
 * A runaway guard, not a size limit. It must sit far above any real directory:
 * at 40 it was smaller than this account, so it silently truncated rather than
 * catching a bug. Tripping it now means the server's cursor is not terminating,
 * which is worth saying out loud rather than quietly returning a short list.
 */
const MAX_PAGES = 200;

export const contactsApi = {
  /**
   * Walk the directory a page at a time and return the whole thing.
   *
   * Callers still get one complete list — the paging is an implementation
   * detail of how it is fetched, not something the A-Z index has to know about.
   */
  async listAll(
    params: { query: string; platform: 'all' | Platform; filter: PeopleFilter },
    /**
     * Called with everything fetched so far, after each page.
     *
     * This directory takes 22 round trips to walk. Waiting for all of them
     * before showing anything means a minute or more of skeleton, which is
     * indistinguishable from the screen being broken — and is what it looked
     * like. Hand back each page as it lands so the list fills in instead.
     */
    onPage?: (soFar: PersonContact[], isLast: boolean) => void,
  ) {
    const contacts: PersonContact[] = [];
    let offset = 0;
    let exhausted = false;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const result = await contactsApi.list({ ...params, offset, limit: PAGE_SIZE });
      contacts.push(...result.contacts);
      const isLast = result.nextOffset === null || !result.contacts.length;
      // The consumer decides how often to publish, but it must never miss the
      // final page: that is the one the A-Z index is measured against.
      onPage?.(contacts, isLast);
      if (isLast || result.nextOffset === null) {
        exhausted = true;
        break;
      }
      offset = result.nextOffset;
    }
    if (!exhausted) {
      // Never fail silently here. A truncated directory looks exactly like a
      // complete one on screen, and its A-Z index is confidently wrong.
      console.warn(
        `[People] stopped after ${MAX_PAGES} pages with ${contacts.length} contacts and more remaining; the directory shown is incomplete.`,
      );
    }
    return contacts;
  },
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
  get(contactId: string) {
    return request<PersonContact>(`/contacts/${encodeURIComponent(contactId)}`);
  },
  saveNotes(contactId: string, notes: string) {
    return request<{ id: string; notes: string | null }>(
      `/contacts/${encodeURIComponent(contactId)}`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes }) },
    );
  },
  startIdentitySync() {
    return request<{ status: 'started' }>('/contacts/identity-backfill', { method: 'POST' });
  },
};
