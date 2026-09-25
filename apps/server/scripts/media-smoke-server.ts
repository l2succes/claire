/** Local-only native/Electron media fixtures. Run with Bun; requires ffmpeg. */
import express from 'express';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { createMediaRouter } from '../src/routes/media';
import { MediaCache } from '../src/services/media-cache';

const directory = await mkdtemp(join(tmpdir(), 'claire-media-fixtures-'));
const inputs = [
  ['landscape.png', ['-f', 'lavfi', '-i', 'testsrc2=size=640x400', '-frames:v', '1']],
  ['portrait.png', ['-f', 'lavfi', '-i', 'testsrc2=size=300x600', '-frames:v', '1']],
  ['video.mp4', ['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100', '-t', '12', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac']],
] as const;
for (const [name, args] of inputs) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args, join(directory, name)]);
  if (result.status !== 0) throw new Error(`Could not generate ${name}: ${result.stderr}`);
}
const cache = new MediaCache();
const app = express();
app.use((_req, res, next) => { res.setHeader('Access-Control-Allow-Origin', '*'); next(); });
app.use('/media', createMediaRouter({
  config: { enabled: true, homeserverUrl: 'http://fixture.invalid', adminToken: 'synthetic' }, cache,
  transcode: async () => { throw new Error('Not used by these fixtures'); },
  // Simulate a homeserver that ignores Range. Use the actual proxy/cache.
  fetch: (async (url: string) => {
    const name = new URL(url).pathname.split('/').pop()!;
    if (!inputs.some(([file]) => file === name)) return new Response(null, { status: 404 });
    return new Response(Readable.toWeb(createReadStream(join(directory, name))) as ReadableStream, { headers: { 'Content-Type': name.endsWith('.mp4') ? 'video/mp4' : 'image/png' } });
  }) as typeof fetch,
}));
const server = app.listen(3311, '127.0.0.1', () => console.log('Synthetic media at http://127.0.0.1:3311; open /media-preview?fixture=1 in Claire Dev.'));
async function stop() { server.close(); await cache.dispose(); await rm(directory, { recursive: true, force: true }); process.exit(0); }
process.once('SIGINT', stop); process.once('SIGTERM', stop);
