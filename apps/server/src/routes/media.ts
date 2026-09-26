import { Router, type Request, type Response } from 'express';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { MediaCache, MediaLimitError } from '../services/media-cache';

interface MediaDependencies {
  config: { enabled: boolean; homeserverUrl?: string; adminToken?: string };
  fetch?: typeof globalThis.fetch;
  cache?: MediaCache;
  transcode: (key: string, bytes: Buffer) => Promise<Buffer>;
  onError?: (error: unknown) => void;
}

export function createMediaRouter(deps: MediaDependencies) {
  const router = Router();
  const cache = deps.cache ?? new MediaCache();
  const fetchMedia = deps.fetch ?? globalThis.fetch;

  router.get('/:server/:mediaId', async (req: Request, res: Response) => {
    if (!deps.config.enabled || !deps.config.homeserverUrl || !deps.config.adminToken) {
      res.status(503).json({ error: 'Matrix not configured' }); return;
    }
    const key = `${req.params.server}/${req.params.mediaId}`;
    const url = `${deps.config.homeserverUrl.replace(/\/$/, '')}/_matrix/client/v1/media/download/${encodeURIComponent(req.params.server)}/${encodeURIComponent(req.params.mediaId)}`;
    const abort = new AbortController();
    const disconnect = () => { if (!res.writableFinished) abort.abort(); };
    res.once('close', disconnect);
    const download = (method: string, headers: Record<string, string>, signal: AbortSignal) => fetchMedia(url, {
      method, headers: { Authorization: `Bearer ${deps.config.adminToken}`, 'Accept-Encoding': 'identity', ...headers }, signal,
    });
    const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(120_000)]);
    let upstream: globalThis.Response | undefined;
    try {
      // Convert the complete representation before applying ranges. Cache the
      // derivative, so subsequent seeks do not trigger another conversion.
      if (req.query.format === 'm4a') {
        const entry = await cache.acquire(`${key}:m4a-v1`, async () => {
          const original = await download('GET', {}, AbortSignal.timeout(120_000));
          if (!original.ok) { await original.body?.cancel(); throw new Error('Audio unavailable'); }
          if (!/(?:audio\/(?:ogg|opus)|application\/ogg)/i.test(original.headers.get('content-type') || '')) {
            await original.body?.cancel();
            throw new UnsupportedAudioError();
          }
          const reader = original.body!.getReader();
          const chunks: Uint8Array[] = [];
          let size = 0;
          try {
            let chunk = await reader.read();
            while (!chunk.done) {
              const value = chunk.value;
              size += value.byteLength;
              if (size > 16 * 1024 * 1024) throw new MediaLimitError('Audio exceeds the conversion limit');
              chunks.push(value);
              chunk = await reader.read();
            }
          } finally { await reader.cancel(); }
          const converted = await deps.transcode(`${key}:m4a`, Buffer.concat(chunks));
          return new globalThis.Response(new Uint8Array(converted), { headers: { 'Content-Type': 'audio/mp4' } });
        });
        res.setHeader('Content-Disposition', 'inline; filename="voice-note.m4a"');
        await sendCached(res, entry);
        return;
      }
      const cached = cache.acquireExisting(key);
      if (cached) { await sendCached(res, cached); return; }
      const headers: Record<string, string> = {};
      const range = req.get('range');
      // Ignore malformed/multipart ranges rather than letting the upstream
      // produce a multipart body that native players do not consume.
      if (req.method !== 'HEAD' && range && /^bytes=(?:\d+-\d*|-\d+)$/.test(range)) headers.Range = range;
      for (const name of ['if-range', 'if-none-match', 'if-modified-since']) {
        const value = req.get(name); if (value) headers[name] = value;
      }
      upstream = await download(req.method === 'HEAD' ? 'HEAD' : 'GET', headers, signal);
      if (headers.Range && upstream.status === 200) {
        // Synapse can return a full file for Range. Store it once on disk and
        // let Express serve correct ranges (including suffix/416) from it.
        const full = upstream;
        const entry = await cache.acquire(key, async () => full);
        await upstream.body?.cancel().catch(() => undefined);
        await sendCached(res, entry);
        return;
      }
      for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
        const value = upstream.headers.get(name); if (value) res.setHeader(name, value);
      }
      res.status(upstream.status);
      if (upstream.ok) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      if (req.method === 'HEAD' || upstream.status === 304 || !upstream.body) {
        await upstream.body?.cancel(); res.end(); return;
      }
      if (!upstream.ok && upstream.status !== 416) {
        await upstream.body.cancel(); res.removeHeader('Content-Length'); res.json({ error: 'Media unavailable' }); return;
      }
      await pipeline(Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]), res, { signal });
    } catch (error) {
      await upstream?.body?.cancel().catch(() => undefined);
      if (abort.signal.aborted) return;
      deps.onError?.(error);
      if (res.headersSent) { res.destroy(); return; }
      res.removeHeader('Content-Length');
      res.removeHeader('Content-Range');
      res.removeHeader('Cache-Control');
      res.status(error instanceof UnsupportedAudioError ? 415 : error instanceof MediaLimitError ? 503 : 502)
        .json({ error: error instanceof UnsupportedAudioError ? 'M4A conversion is only available for Ogg/Opus audio' : 'Failed to prepare media' });
    } finally { res.removeListener('close', disconnect); }
  });
  return router;
}

class UnsupportedAudioError extends Error {}

async function sendCached(res: Response, entry: Awaited<ReturnType<MediaCache['acquire']>>) {
  try {
    if (res.destroyed) return;
    res.setHeader('Content-Type', entry.contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    if (entry.etag) res.setHeader('ETag', entry.etag);
    if (entry.lastModified) res.setHeader('Last-Modified', entry.lastModified);
    await new Promise<void>((resolve, reject) => res.sendFile(entry.path, { dotfiles: 'deny', cacheControl: false }, (error) => {
      // sendFile sets Content-Range on unsatisfiable requests.
      if (error && 'statusCode' in error && error.statusCode === 416 && !res.headersSent) { res.status(416).end(); resolve(); }
      else if (error) reject(error); else resolve();
    }));
  } finally { entry.release(); }
}
