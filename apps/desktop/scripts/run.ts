/**
 * Launch the desktop app on one of two channels.
 *
 *   bun run dev    debug      — Expo dev server + Electron, Fast Refresh, DevTools
 *   bun run prod   production — the exported web bundle over claire-app://
 *
 * The two are separate applications: different names, icons, and userData
 * directories, so they can run at the same time without fighting over the
 * single-instance lock or each other's sessions.
 *
 * Usage: bun run scripts/run.ts <dev|prod> [--fresh]
 */

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DESKTOP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT_DIR = join(DESKTOP_DIR, '..', 'client');
const RENDERER_INDEX = join(DESKTOP_DIR, 'renderer', 'index.html');

const channel = process.argv[2] === 'dev' ? 'dev' : 'production';
const fresh = process.argv.includes('--fresh');

/** Child processes to tear down together, newest first. */
const children: ChildProcess[] = [];

function run(command: string, args: string[], cwd: string): void {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with status ${String(result.status)}`);
  }
}

/**
 * Find a port nothing is already using.
 *
 * Expo's default 8081 is routinely held by another checkout's dev server, and
 * `expo start` cannot prompt in a non-interactive shell — it just gives up.
 *
 * Both checks are needed. Binding alone is not sufficient: another Expo
 * listening on the IPv6 wildcard (`*:8081`) does not prevent an IPv4-loopback
 * bind from succeeding, so the port looks free. The dev server then fails to
 * start, `http://localhost` resolves to ::1, and the readiness probe is
 * satisfied by *their* server — Electron comes up showing a different
 * checkout's app with nothing to indicate it.
 */
function canBind(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    // No host argument: binds the wildcard, so a conflict on either stack fails.
    server.listen(port);
  });
}

async function isAnswering(port: number): Promise<boolean> {
  try {
    await fetch(`http://localhost:${String(port)}`, {
      redirect: 'manual',
      signal: AbortSignal.timeout(1500),
    });
    return true;
  } catch {
    return false;
  }
}

async function freePort(preferred: number, attempts = 20): Promise<number> {
  for (let port = preferred; port < preferred + attempts; port += 1) {
    if (await isAnswering(port)) continue;
    if (await canBind(port)) return port;
  }
  throw new Error(`No free port in ${String(preferred)}-${String(preferred + attempts - 1)}`);
}

async function waitForServer(url: string, timeoutMs = 180_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: 'manual' });
      if (response.status > 0) return;
    } catch {
      // Metro is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for the dev server at ${url}`);
}

function startElectron(env: NodeJS.ProcessEnv): ChildProcess {
  const electron = spawn('bunx', ['electron', '.'], {
    cwd: DESKTOP_DIR,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  children.push(electron);
  // Quitting the app ends the whole session, dev server included.
  electron.on('exit', (code) => {
    shutdown();
    process.exit(code ?? 0);
  });
  return electron;
}

function shutdown(): void {
  while (children.length) {
    const child = children.pop();
    if (child && !child.killed) child.kill('SIGTERM');
  }
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    shutdown();
    process.exit(0);
  });
}

async function main(): Promise<void> {
  run('bun', ['run', 'build'], DESKTOP_DIR);

  if (channel === 'dev') {
    const port = await freePort(8081);
    const url = `http://localhost:${String(port)}`;

    console.log(`\n▸ Claire Dev — starting the Expo web dev server on ${url}\n`);
    const expo = spawn('bunx', ['expo', 'start', '--web', '--port', String(port)], {
      cwd: CLIENT_DIR,
      stdio: 'inherit',
      env: { ...process.env, BROWSER: 'none' },
    });
    children.push(expo);

    await waitForServer(url);
    console.log(`\n▸ Dev server ready. Launching Claire Dev.\n`);

    startElectron({ CLAIRE_DESKTOP_CHANNEL: 'dev', CLAIRE_DEV_SERVER_URL: url });
    return;
  }

  // Production: serve the exported bundle, no dev server involved.
  if (fresh || !existsSync(RENDERER_INDEX)) {
    console.log('\n▸ Exporting the client web bundle…\n');
    run('bun', ['run', 'bundle:renderer'], DESKTOP_DIR);
  } else {
    console.log('\n▸ Using the existing renderer bundle. Pass --fresh to re-export.\n');
  }

  console.log('\n▸ Launching Claire.\n');
  startElectron({ CLAIRE_DESKTOP_CHANNEL: 'production' });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  shutdown();
  process.exit(1);
});
