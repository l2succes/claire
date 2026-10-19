import { createHash } from 'node:crypto';
import { createWriteStream, rmSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export class MediaLimitError extends Error {}
export interface CachedMedia {
  path: string;
  size: number;
  contentType: string;
  etag?: string;
  lastModified?: string;
}
type Entry = CachedMedia & { touched: number; readers: number };

/** Bounded, process-local fallback for homeservers that ignore byte ranges. */
export class MediaCache {
  private entries = new Map<string, Entry>();
  private pending = new Map<string, Promise<Entry>>();
  private directory: Promise<string> | undefined;
  private directoryPath: string | undefined;
  private exitCleanup = () => { if (this.directoryPath) rmSync(this.directoryPath, { recursive: true, force: true }); };

  constructor(private limits = { fileBytes: 256 * 1024 * 1024, totalBytes: 512 * 1024 * 1024, ttlMs: 60 * 60_000 }) {
    process.once('exit', this.exitCleanup);
  }

  private async root() {
    this.directory ??= mkdtemp(join(tmpdir(), 'claire-media-')).then((path) => { this.directoryPath = path; return path; });
    return this.directory;
  }

  private reserve() {
    let occupied = [...this.entries.values()].reduce((sum, entry) => sum + entry.size, 0)
      + this.pending.size * this.limits.fileBytes;
    for (const [key, entry] of [...this.entries].sort((a, b) => a[1].touched - b[1].touched)) {
      if (entry.readers) continue;
      if (occupied + this.limits.fileBytes <= this.limits.totalBytes && Date.now() - entry.touched < this.limits.ttlMs) continue;
      this.entries.delete(key);
      occupied -= entry.size;
      rmSync(entry.path, { force: true });
    }
    if (occupied + this.limits.fileBytes > this.limits.totalBytes) throw new MediaLimitError('Media cache is busy');
  }

  async acquire(key: string, load: () => Promise<globalThis.Response>) {
    let entry = this.entries.get(key);
    if (!entry) {
      let task = this.pending.get(key);
      if (!task) {
        this.reserve();
        task = this.download(key, load);
        this.pending.set(key, task);
      }
      try { entry = await task; }
      finally { if (this.pending.get(key) === task) this.pending.delete(key); }
    }
    return this.lease(entry);
  }

  acquireExisting(key: string) {
    const entry = this.entries.get(key);
    return entry ? this.lease(entry) : undefined;
  }

  private lease(entry: Entry) {
    entry.readers++;
    entry.touched = Date.now();
    let released = false;
    return { ...entry, release: () => { if (!released) { released = true; entry!.readers--; } } };
  }

  private async download(key: string, load: () => Promise<globalThis.Response>): Promise<Entry> {
    const path = join(await this.root(), createHash('sha256').update(key).digest('hex'));
    const response = await load();
    let size = 0;
    try {
      if (!response.ok || response.status === 206 || !response.body) throw new Error('Could not download complete media');
      const declared = Number(response.headers.get('content-length'));
      if (declared > this.limits.fileBytes) throw new MediaLimitError('Media exceeds the download limit');
      const meter = new Transform({ transform: (chunk, _encoding, callback) => {
        size += chunk.length;
        callback(size > this.limits.fileBytes ? new MediaLimitError('Media exceeds the download limit') : null, chunk);
      } });
      await pipeline(Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]), meter, createWriteStream(path));
      if (declared > 0 && size !== declared) throw new Error('Incomplete media download');
      const entry: Entry = { path, size, touched: Date.now(), readers: 0,
        contentType: response.headers.get('content-type') || 'application/octet-stream',
        etag: response.headers.get('etag') || undefined,
        lastModified: response.headers.get('last-modified') || undefined };
      this.entries.set(key, entry);
      return entry;
    } catch (error) {
      await response.body?.cancel().catch(() => undefined);
      await rm(path, { force: true });
      throw error;
    }
  }

  async dispose() {
    await Promise.allSettled(this.pending.values());
    process.removeListener('exit', this.exitCleanup);
    if (this.directory) await rm(await this.directory, { recursive: true, force: true });
    this.entries.clear();
  }
}
