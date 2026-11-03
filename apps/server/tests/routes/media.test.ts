import { afterEach, describe, expect, it, mock } from 'bun:test';
import express from 'express';
import supertest from 'supertest';
import { createMediaRouter } from '../../src/routes/media';
import { MediaCache } from '../../src/services/media-cache';
import { createMediaTokenSigner } from '../../src/services/media-token';
import type { RequestHandler } from 'express';

const caches: MediaCache[] = [];
afterEach(async () => { await Promise.all(caches.splice(0).map((cache) => cache.dispose())); });
const bytes = Buffer.from('0123456789');
const USER_ID = '11111111-1111-4111-8111-111111111111';
const tokens = createMediaTokenSigner('test-media-secret', ['https://api.example.com']);
const token = tokens.issue(USER_ID).token;
const signed = (path: string) => `${path}${path.includes('?') ? '&' : '?'}mt=${encodeURIComponent(token)}`;
const fakeAuth: RequestHandler = (req, res, next) => {
  if (req.get('authorization') !== 'Bearer session') { res.status(401).end(); return; }
  req.user = { id: USER_ID }; next();
};
function setup(fetcher: (url: string, init: RequestInit) => Promise<Response>, transcode = mock(async () => bytes)) {
  const cache = new MediaCache({ fileBytes: 1024, totalBytes: 2048, ttlMs: 1000 });
  caches.push(cache);
  const fetch = mock(fetcher);
  const app = express();
  app.use('/media', createMediaRouter({ config: { enabled: true, homeserverUrl: 'http://matrix', adminToken: 'test-only', serverName: 'server' }, tokens, requireAuth: fakeAuth, cache, fetch: fetch as unknown as typeof globalThis.fetch, transcode }));
  return { request: supertest(app), fetch, transcode };
}
function full() { return new Response(bytes, { headers: { 'content-type': 'video/mp4', 'content-length': '10', etag: '"original"' } }); }

describe('Matrix media delivery', () => {
  it('streams an ordinary response and preserves type/length', async () => {
    const { request } = setup(async () => full());
    const response = await request.get(signed('/media/server/id'));
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('video/mp4');
    expect(response.headers['content-length']).toBe('10');
    expect(response.body).toEqual(bytes);
  });
  it('forwards ranges and preserves upstream partial response headers', async () => {
    const { request, fetch } = setup(async () => new Response(bytes.subarray(2, 5), { status: 206, headers: { 'content-type': 'video/mp4', 'content-length': '3', 'content-range': 'bytes 2-4/10', 'accept-ranges': 'bytes' } }));
    const response = await request.get(signed('/media/server/id')).set('Range', 'bytes=2-4');
    expect(response.status).toBe(206);
    expect(response.body).toEqual(bytes.subarray(2, 5));
    expect(response.headers['content-range']).toBe('bytes 2-4/10');
    expect(fetch.mock.calls[0][1].headers).toMatchObject({ Range: 'bytes=2-4' });
  });
  it.each([
    ['bytes=0-1', 206, '01', 'bytes 0-1/10'],
    ['bytes=7-', 206, '789', 'bytes 7-9/10'],
    ['bytes=-3', 206, '789', 'bytes 7-9/10'],
    ['bytes=99-', 416, '', 'bytes */10'],
  ])('serves %s when upstream ignores ranges', async (range, status, body, contentRange) => {
    const { request } = setup(async () => full());
    const response = await request.get(signed('/media/server/id')).set('Range', range);
    expect(response.status).toBe(status);
    expect(Buffer.from(response.body).toString()).toBe(body);
    expect(response.headers['content-range']).toBe(contentRange);
  });
  it('uses the original validator for If-Range and returns the full representation on mismatch', async () => {
    const { request } = setup(async () => full());
    const matched = await request.get(signed('/media/server/id')).set('Range', 'bytes=0-1').set('If-Range', '"original"');
    expect(matched.status).toBe(206);
    const stale = await request.get(signed('/media/server/id')).set('Range', 'bytes=0-1').set('If-Range', '"stale"');
    expect(stale.status).toBe(200);
    expect(stale.body).toEqual(bytes);
  });
  it('reuses the completed fallback for later seeks and HEAD requests', async () => {
    const { request, fetch } = setup(async () => full());
    await request.get(signed('/media/server/id')).set('Range', 'bytes=0-1');
    const seek = await request.get(signed('/media/server/id')).set('Range', 'bytes=7-');
    expect(seek.body).toEqual(bytes.subarray(7));
    const head = await request.head(signed('/media/server/id'));
    expect(head.headers['content-length']).toBe('10');
    expect(head.text).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('discards an incomplete fallback and allows a clean retry', async () => {
    let attempt = 0;
    const { request } = setup(async () => ++attempt === 1
      ? new Response(bytes.subarray(0, 3), { headers: { 'content-length': '10' } })
      : full());
    const failed = await request.get(signed('/media/server/id')).set('Range', 'bytes=0-1');
    expect(failed.status).toBe(502);
    expect(failed.headers['cache-control']).toBeUndefined();
    const retry = await request.get(signed('/media/server/id')).set('Range', 'bytes=0-1');
    expect(retry.status).toBe(206);
    expect(retry.body).toEqual(bytes.subarray(0, 2));
  });
  it('preserves HEAD metadata and sends no body', async () => {
    const { request, fetch } = setup(async () => new Response(null, { headers: { 'content-type': 'video/mp4', 'content-length': '10' } }));
    const response = await request.head(signed('/media/server/id'));
    expect(fetch.mock.calls[0][1].method).toBe('HEAD');
    expect(response.status).toBe(200);
    expect(response.headers['content-length']).toBe('10');
    expect(response.text).toBeUndefined();
  });
  it('preserves 304 and upstream 416', async () => {
    const conditional = setup(async () => new Response(null, { status: 304, headers: { etag: '"original"' } }));
    expect((await conditional.request.get(signed('/media/server/id')).set('If-None-Match', '"original"')).status).toBe(304);
    const invalid = setup(async () => new Response(null, { status: 416, headers: { 'content-range': 'bytes */10' } }));
    const response = await invalid.request.get(signed('/media/server/id')).set('Range', 'bytes=99-');
    expect(response.status).toBe(416);
    expect(response.headers['content-range']).toBe('bytes */10');
  });
  it('reports an unavailable source without caching the failure', async () => {
    const { request } = setup(async () => new Response('missing', { status: 404 }));
    const response = await request.get(signed('/media/server/id'));
    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Media unavailable');
    expect(response.headers['cache-control']).toBeUndefined();
  });
  it('bounds fallback downloads, including unknown lengths', async () => {
    const { request } = setup(async () => new Response(Buffer.alloc(2048), { headers: { 'content-type': 'video/mp4' } }));
    expect((await request.get(signed('/media/server/id')).set('Range', 'bytes=0-1')).status).toBe(503);
  });
  it('serves ranges of the converted voice note and reuses the derivative', async () => {
    const { request, transcode, fetch } = setup(async () => new Response('ogg-fixture', { headers: { 'content-type': 'audio/ogg' } }));
    const first = await request.get(signed('/media/server/id?format=m4a')).set('Range', 'bytes=0-1');
    expect(first.status).toBe(206);
    expect(first.headers['content-type']).toBe('audio/mp4');
    expect(first.body).toEqual(bytes.subarray(0, 2));
    await request.get(signed('/media/server/id?format=m4a')).set('Range', 'bytes=2-4');
    expect(transcode).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('rejects conversion of a video instead of relabeling it as audio', async () => {
    const { request, transcode } = setup(async () => full());
    expect((await request.get(signed('/media/server/id?format=m4a'))).status).toBe(415);
    expect(transcode).not.toHaveBeenCalled();
  });
});

describe('Matrix media access control', () => {
  it('rejects requests without a valid, unexpired media token before contacting the homeserver', async () => {
    const { request, fetch } = setup(async () => full());
    expect((await request.get('/media/server/id')).status).toBe(401);
    expect((await request.get('/media/server/id?mt=not-a-token')).status).toBe(401);
    const forged = token.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'));
    expect((await request.get(`/media/server/id?mt=${encodeURIComponent(forged)}`)).status).toBe(401);
    const expired = tokens.issue(USER_ID, Date.now() - 13 * 60 * 60 * 1000).token;
    expect((await request.get(`/media/server/id?mt=${encodeURIComponent(expired)}`)).status).toBe(401);
    const other = createMediaTokenSigner('another-secret').issue(USER_ID).token;
    expect((await request.get(`/media/server/id?mt=${encodeURIComponent(other)}`)).status).toBe(401);
    expect((await request.get('/media/server/id?format=m4a')).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('only proxies media from the configured homeserver', async () => {
    const { request, fetch } = setup(async () => full());
    expect((await request.get(signed('/media/elsewhere.example/id'))).status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('does not mark media responses as publicly cacheable', async () => {
    const { request } = setup(async () => full());
    const direct = await request.get(signed('/media/server/id'));
    expect(direct.headers['cache-control']).toBe('private, max-age=21600');
    const ranged = await request.get(signed('/media/server/id')).set('Range', 'bytes=0-1');
    expect(ranged.headers['cache-control']).toBe('private, max-age=21600');
  });
  it('issues a media token only to an authenticated session', async () => {
    const { request } = setup(async () => full());
    expect((await request.get('/media/token')).status).toBe(401);
    const response = await request.get('/media/token').set('Authorization', 'Bearer session');
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(tokens.verify(response.body.token)).toBe(USER_ID);
  });
});

describe('media token signer', () => {
  it('keeps URLs stable within a window and expires within two', () => {
    const now = Date.UTC(2026, 10, 3, 1, 0, 0);
    const a = tokens.issue(USER_ID, now);
    expect(tokens.issue(USER_ID, now + 60 * 60 * 1000).token).toBe(a.token);
    expect(tokens.verify(a.token, now)).toBe(USER_ID);
    expect(tokens.verify(a.token, Date.parse(a.expiresAt))).toBeNull();
  });
  it('signs only proxied media on this server', () => {
    expect(tokens.signUrl('/media/server/id', USER_ID)).toMatch(/^\/media\/server\/id\?mt=/);
    expect(tokens.signUrl('https://api.example.com/media/server/id', USER_ID)).toMatch(/^https:\/\/api\.example\.com\/media\/server\/id\?mt=/);
    expect(tokens.signUrl('https://cdn.example.com/media/server/id', USER_ID)).toBe('https://cdn.example.com/media/server/id');
    expect(tokens.signUrl('https://api.example.com/avatars/me.jpg', USER_ID)).toBe('https://api.example.com/avatars/me.jpg');
    expect(tokens.signUrl(undefined, USER_ID)).toBeUndefined();
  });
});
