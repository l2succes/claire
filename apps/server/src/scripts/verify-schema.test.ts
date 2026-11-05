import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Exercise the same bundled entry point shipped in Docker, with an isolated
// local PostgREST stub. No production environment or database is involved.
describe('bundled pre-deploy schema command', () => {
  let directory: string;
  let entrypoint: string;

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'claire-schema-gate-'));
    entrypoint = join(directory, 'verify-schema.js');
    const build = await Bun.build({
      entrypoints: [join(import.meta.dir, 'verify-schema.ts')],
      target: 'bun',
      outdir: directory,
    });
    expect(build.success).toBe(true);
  });

  afterAll(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  async function runGate(mode: 'ok' | 'drift' | 'unavailable' | 'mixed') {
    const requests: Request[] = [];
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch(request) {
        requests.push(request);
        const table = new URL(request.url).pathname.split('/').pop();
        if ((mode === 'drift' || mode === 'mixed') && table === 'messages') {
          return Response.json({ code: '42703', message: 'column messages.snoozed_until does not exist' }, { status: 400 });
        }
        if (mode === 'unavailable' || (mode === 'mixed' && table === 'chats')) {
          return Response.json({ code: 'PGRST301', message: 'JWT expired' }, { status: 401 });
        }
        return Response.json([]);
      },
    });
    try {
      const child = Bun.spawn([process.execPath, entrypoint], {
        cwd: directory,
        env: {
          NODE_ENV: 'production',
          SUPABASE_URL: server.url.toString(),
          SUPABASE_ANON_KEY: 'test-anon-key',
          SUPABASE_SERVICE_KEY: 'test-service-key',
          DATABASE_URL: 'postgresql://test:test@127.0.0.1/test',
          JWT_SECRET: 'test-jwt-secret-minimum-32-characters-long',
          ENCRYPTION_KEY: 'test-encryption-key-32chars!!!!!',
          PLATFORM_MODE: 'direct',
        },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const [stdout, stderr, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      expect(requests.length).toBeGreaterThan(0);
      expect(requests.every((request) => request.method === 'GET')).toBe(true);
      return { stdout, stderr, code };
    } finally {
      server.stop(true);
    }
  }

  it('exits 0 only when the complete manifest resolves', async () => {
    const result = await runGate('ok');
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('schema OK');
  });

  it('exits 1 and names missing schema', async () => {
    const result = await runGate('drift');
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('messages');
    expect(result.stdout).not.toContain('schema OK');
  });

  it('exits 2 when database access cannot verify schema', async () => {
    const result = await runGate('unavailable');
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('Could not verify');
    expect(result.stdout).not.toContain('schema OK');
  });

  it('reports both drift and operational errors, with exit 2', async () => {
    const result = await runGate('mixed');
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('messages');
    expect(result.stderr).toContain('Could not verify chats');
  });
});
