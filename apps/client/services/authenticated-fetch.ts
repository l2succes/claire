import { supabase } from './supabase';

let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = supabase.auth
      .refreshSession()
      .then(({ data, error }) => (error ? null : data.session?.access_token || null))
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

function withBearerToken(init: RequestInit, token: string | null): RequestInit {
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  else headers.delete('Authorization');
  return { ...init, headers };
}

/**
 * Fetch with the current Supabase session and retry one unauthorized response
 * after refreshing it. This keeps a token that expired while the app was in
 * the background from surfacing as a raw "Invalid token" product error.
 */
export async function authenticatedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  let response = await fetch(input, withBearerToken(init, session?.access_token || null));
  if (response.status !== 401) return response;

  const refreshedToken = await refreshAccessToken();
  if (!refreshedToken) return response;
  response = await fetch(input, withBearerToken(init, refreshedToken));
  return response;
}
