import { supabase } from './supabase';
import { router } from 'expo-router';
import { getActiveScreen } from './active-screen';

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
  headers.set('X-Claire-Screen', getActiveScreen());
  if (token) headers.set('Authorization', `Bearer ${token}`);
  else headers.delete('Authorization');
  return { ...init, headers };
}

function sessionIsExpiringSoon(session: { expires_at?: number | null } | null): boolean {
  return Boolean(session?.expires_at && session.expires_at * 1000 <= Date.now() + 60_000);
}

/**
 * Start with a fresh token when iOS has restored an expired session. Retrying a
 * 401 remains the backstop, but a proactive refresh avoids sending an Ask
 * Claire stream that is guaranteed to be rejected before it can begin.
 */
async function currentAccessToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  if (!sessionIsExpiringSoon(session)) return session.access_token;
  return (await refreshAccessToken()) || session.access_token;
}

function openPaywallOnExhaustedCredits(response: Response): void {
  if (response.status !== 402) return;
  router.push('/paywall?source=credits' as never);
}

/**
 * Fetch with the current Supabase session and retry one unauthorized response
 * after refreshing it. This keeps a token that expired while the app was in
 * the background from surfacing as a raw "Invalid token" product error.
 */
export async function authenticatedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  let response = await fetch(input, withBearerToken(init, await currentAccessToken()));
  if (response.status !== 401) {
    openPaywallOnExhaustedCredits(response);
    return response;
  }

  const refreshedToken = await refreshAccessToken();
  if (!refreshedToken) return response;
  response = await fetch(input, withBearerToken(init, refreshedToken));
  openPaywallOnExhaustedCredits(response);
  return response;
}

/** Expo's native fetch implementation exposes a real streaming response body. */
export async function authenticatedExpoFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const { fetch: expoFetch } = await import('expo/fetch');
  let response = await expoFetch(input, withBearerToken(init, await currentAccessToken())) as unknown as Response;
  if (response.status !== 401) {
    openPaywallOnExhaustedCredits(response);
    return response;
  }
  const refreshedToken = await refreshAccessToken();
  if (!refreshedToken) return response;
  response = await expoFetch(input, withBearerToken(init, refreshedToken)) as unknown as Response;
  openPaywallOnExhaustedCredits(response);
  return response;
}
