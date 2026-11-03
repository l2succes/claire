import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { isProxiedMediaUrl, withMediaToken } from '@claire/chat-core';
import { authenticatedFetch } from '../services/authenticated-fetch';
import { API_BASE_URL } from '../services/platforms';

/** Fetch a fresh token this long before the current one expires. */
const REFRESH_MARGIN_MS = 60 * 60 * 1000;
const RETRY_MS = 30 * 1000;

interface MediaTokenState {
  token: string | null;
  expiresAt: number;
  ensure: () => Promise<void>;
  clear: () => void;
}

let inFlight: Promise<void> | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let generation = 0;

function scheduleRefresh(delayMs: number) {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    void useMediaTokenStore.getState().ensure();
  }, Math.max(RETRY_MS, delayMs));
}

/**
 * The server's `/media` proxy authenticates with a short-lived token in the
 * URL, since image and player elements cannot send the session header. One
 * token covers every media URL for the signed-in user; it is refreshed ahead
 * of expiry and dropped on sign-out.
 */
export const useMediaTokenStore = create<MediaTokenState>((set, get) => ({
  token: null,
  expiresAt: 0,
  ensure: () => {
    if (get().token && get().expiresAt - Date.now() > REFRESH_MARGIN_MS) return Promise.resolve();
    if (inFlight) return inFlight;
    const started = generation;
    inFlight = (async () => {
      try {
        const response = await authenticatedFetch(`${API_BASE_URL}/media/token`);
        if (!response.ok) throw new Error(`Media token request failed (${response.status})`);
        const body = await response.json() as { token?: unknown; expiresAt?: unknown };
        const expiresAt = typeof body.expiresAt === 'string' ? Date.parse(body.expiresAt) : NaN;
        if (typeof body.token !== 'string' || !Number.isFinite(expiresAt)) throw new Error('Malformed media token');
        if (started !== generation) return;
        set({ token: body.token, expiresAt });
        scheduleRefresh(expiresAt - Date.now() - REFRESH_MARGIN_MS);
      } catch {
        // Media stays hidden until a token arrives; try again shortly.
        if (started === generation) scheduleRefresh(RETRY_MS);
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  },
  clear: () => {
    generation += 1;
    inFlight = null;
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = null;
    set({ token: null, expiresAt: 0 });
  },
}));

/**
 * Resolve a media URL to something an element can load. Proxied media gets
 * the current token, or `undefined` until one is available, so a request that
 * would be rejected is never issued. Other URLs pass through unchanged.
 */
export function useSignedMediaUrl(url: string | null | undefined): string | undefined {
  const needsToken = isProxiedMediaUrl(url, API_BASE_URL);
  const token = useMediaTokenStore((state) => (needsToken ? state.token : null));
  useEffect(() => {
    if (needsToken) void useMediaTokenStore.getState().ensure();
  }, [needsToken]);
  if (!url) return undefined;
  if (!needsToken) return url;
  return token ? withMediaToken(url, API_BASE_URL, token) ?? undefined : undefined;
}

/**
 * Image source for a media URL. The cache key omits the token, so the image
 * cache survives token rotation instead of downloading everything again.
 */
export function useSignedMediaSource(url: string | null | undefined): { uri: string; cacheKey?: string } | undefined {
  const uri = useSignedMediaUrl(url);
  if (!uri || !url) return undefined;
  return uri === url ? { uri } : { uri, cacheKey: url };
}

/**
 * Like `useSignedMediaUrl`, but keeps the first signed URL for the lifetime of
 * the caller, so a token refresh does not reload a player mid-playback.
 */
export function useStableSignedMediaUrl(url: string | null | undefined): string | undefined {
  const signed = useSignedMediaUrl(url);
  const held = useRef<{ url: string; signed: string } | null>(null);
  if (signed && url && held.current?.url !== url) held.current = { url, signed };
  return url && held.current?.url === url ? held.current.signed : signed;
}

/** Sign a media URL outside render, e.g. before handing it to the system browser. */
export async function signMediaUrlNow(url: string): Promise<string | null> {
  if (!isProxiedMediaUrl(url, API_BASE_URL)) return url;
  await useMediaTokenStore.getState().ensure();
  const { token } = useMediaTokenStore.getState();
  return token ? withMediaToken(url, API_BASE_URL, token) : null;
}
