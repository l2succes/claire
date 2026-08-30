import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const TRANSCODE_TIMEOUT_MS = 30_000;
const MAX_TRANSCODE_INPUT_BYTES = 16 * 1024 * 1024;
const inFlight = new Map<string, Promise<Buffer>>();

export class AudioTranscodeError extends Error {
  constructor(message = 'Audio conversion failed') {
    super(message);
    this.name = 'AudioTranscodeError';
  }
}

async function runFfmpeg(input: Buffer, outputExtension: string, args: string[]): Promise<Buffer> {
  if (!input.length) throw new AudioTranscodeError('Audio input was empty');
  if (input.length > MAX_TRANSCODE_INPUT_BYTES) {
    throw new AudioTranscodeError('Audio input exceeded the conversion limit');
  }
  const directory = await mkdtemp(join(tmpdir(), 'claire-audio-'));
  const inputPath = join(directory, 'input-audio');
  const outputPath = join(directory, `output${outputExtension}`);
  try {
    await writeFile(inputPath, input);
    await new Promise<void>((resolve, reject) => {
      const child = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', inputPath, ...args, outputPath], {
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      let diagnostic = '';
      child.stderr.on('data', (chunk) => {
        if (diagnostic.length < 1_000) diagnostic += String(chunk).slice(0, 1_000 - diagnostic.length);
      });
      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new AudioTranscodeError('Audio conversion timed out'));
      }, TRANSCODE_TIMEOUT_MS);
      child.once('error', (error) => {
        clearTimeout(timeout);
        reject(new AudioTranscodeError(error.message));
      });
      child.once('exit', (code) => {
        clearTimeout(timeout);
        if (code === 0) resolve();
        else reject(new AudioTranscodeError(diagnostic.trim() || `FFmpeg exited with code ${code}`));
      });
    });
    return await readFile(outputPath);
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function transcodeVoiceToM4a(input: Buffer): Promise<Buffer> {
  return runFfmpeg(input, '.m4a', [
    '-vn',
    '-ac', '1',
    '-c:a', 'aac',
    '-b:a', '64k',
    '-movflags', '+faststart',
  ]);
}

export function transcodeVoiceToOggOpus(input: Buffer): Promise<Buffer> {
  return runFfmpeg(input, '.ogg', [
    '-vn',
    '-ac', '1',
    '-ar', '48000',
    '-c:a', 'libopus',
    '-b:a', '32k',
    '-application', 'voip',
  ]);
}

/** Matrix media IDs are immutable, so concurrent requests can share the same conversion. */
export function transcodeVoiceToM4aOnce(key: string, input: Buffer): Promise<Buffer> {
  const existing = inFlight.get(key);
  if (existing) return existing;
  const conversion = transcodeVoiceToM4a(input).finally(() => inFlight.delete(key));
  inFlight.set(key, conversion);
  return conversion;
}
