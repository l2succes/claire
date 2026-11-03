import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config';

/**
 * Short-lived, user-bound tokens for the `/media` proxy.
 *
 * Media is loaded by image/video/audio elements and by notification service
 * extensions, none of which can attach an Authorization header, so the token
 * travels as the `mt` query parameter. Expiry is aligned to fixed windows so a
 * user's media URLs stay byte-identical (and cacheable) for a whole window
 * instead of changing on every request.
 */
export const MEDIA_TOKEN_PARAM = 'mt';
const WINDOW_SECONDS = 6 * 60 * 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MEDIA_PATH = /^\/media\/[^/]+\/[^/]+$/;

export interface MediaToken {
  token: string;
  expiresAt: string;
}

export interface MediaTokenSigner {
  issue(userId: string, nowMs?: number): MediaToken;
  /** The user the token was issued to, or null if it is malformed or expired. */
  verify(token: unknown, nowMs?: number): string | null;
  /**
   * Append a token to a URL that points at this server's media proxy (a
   * relative `/media/...` path or one on `apiOrigins`); leave anything else
   * unchanged so the token never travels to another host.
   */
  signUrl<T extends string | undefined | null>(url: T, userId: string, nowMs?: number): T;
}

export function createMediaTokenSigner(secret: string, apiOrigins: string[] = []): MediaTokenSigner {
  if (!secret) throw new Error('A media token secret is required');
  // Derive a dedicated key so this token can never be confused with another
  // value signed with the same root secret.
  const key = createHmac('sha256', secret).update('claire-media-token-v1').digest();
  const mac = (payload: string) => createHmac('sha256', key).update(payload).digest('base64url');
  const origins = new Set(apiOrigins.flatMap((value) => {
    try { return [new URL(value).origin]; } catch { return []; }
  }));

  const issue = (userId: string, nowMs = Date.now()): MediaToken => {
    if (!UUID.test(userId)) throw new Error('Media tokens are issued to user ids');
    const now = Math.floor(nowMs / 1000);
    // Valid for at least one full window and at most two.
    const exp = (Math.floor(now / WINDOW_SECONDS) + 2) * WINDOW_SECONDS;
    const payload = `${userId.toLowerCase()}.${exp}`;
    return { token: `${payload}.${mac(payload)}`, expiresAt: new Date(exp * 1000).toISOString() };
  };

  const verify = (token: unknown, nowMs = Date.now()): string | null => {
    if (typeof token !== 'string' || token.length > 256) return null;
    const [userId, expRaw, signature, ...rest] = token.split('.');
    if (rest.length || !userId || !expRaw || !signature || !UUID.test(userId) || !/^\d+$/.test(expRaw)) return null;
    const expected = Buffer.from(mac(`${userId}.${expRaw}`));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const exp = Number(expRaw);
    const now = Math.floor(nowMs / 1000);
    if (exp <= now || exp > now + 2 * WINDOW_SECONDS) return null;
    return userId;
  };

  const signUrl = <T extends string | undefined | null>(url: T, userId: string, nowMs = Date.now()): T => {
    if (!url) return url;
    const isRelative = url.startsWith('/');
    let parsed: URL;
    try {
      parsed = new URL(url, 'http://relative.invalid');
    } catch {
      return url;
    }
    if (!isRelative && !origins.has(parsed.origin)) return url;
    if (!MEDIA_PATH.test(parsed.pathname)) return url;
    parsed.searchParams.set(MEDIA_TOKEN_PARAM, issue(userId, nowMs).token);
    return (isRelative ? `${parsed.pathname}${parsed.search}` : parsed.toString()) as T;
  };

  return { issue, verify, signUrl };
}

/** Base URL the server advertises for its own routes, e.g. in stored avatar URLs. */
export function publicApiBaseUrl(): string {
  return process.env.PUBLIC_API_URL
    || (process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : `http://localhost:${process.env.PORT || '3001'}`);
}

let defaultSigner: MediaTokenSigner | undefined;

/** Process-wide signer keyed from the server's secret. */
export function mediaTokens(): MediaTokenSigner {
  defaultSigner ??= createMediaTokenSigner(config.MEDIA_TOKEN_SECRET || config.JWT_SECRET, [publicApiBaseUrl()]);
  return defaultSigner;
}
