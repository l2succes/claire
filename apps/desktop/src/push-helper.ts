import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { app } from 'electron';
import { getPreference, setPreference } from './preferences';
import type { PushSetupRequest } from './shared/ipc';

let helper: ChildProcess | null = null;
let token: string | null = null;
let setup: PushSetupRequest | null = null;

function helperPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'ClairePushHelper')
    : path.join(__dirname, '..', 'native', 'macos', 'build', 'ClairePushHelper');
}

export function startPushHelper(): void {
  if (process.platform !== 'darwin' || helper) return;
  const executable = helperPath();
  if (!existsSync(executable)) return;
  helper = spawn(executable, [], { stdio: ['ignore', 'pipe', 'ignore'] });
  helper.stdout?.on('data', (chunk: Buffer) => {
    const match = chunk.toString().match(/CLAIRE_APNS_TOKEN=([a-f0-9]+)/i);
    if (!match) return;
    token = match[1];
    void register();
  });
  helper.on('exit', () => { helper = null; });
}

export async function configurePushHelper(value: unknown): Promise<void> {
  const candidate = value as Partial<PushSetupRequest> | null;
  if (!candidate || typeof candidate.apiUrl !== 'string' || typeof candidate.accessToken !== 'string' || candidate.accessToken.length < 20) return;
  try { new URL(candidate.apiUrl); } catch { return; }
  setup = { apiUrl: candidate.apiUrl, accessToken: candidate.accessToken };
  startPushHelper();
  await register();
}

async function register(): Promise<void> {
  if (!setup || !token) return;
  let deviceId = getPreference('desktop.push-device-id');
  if (!deviceId) { deviceId = `desktop-${randomUUID()}`; setPreference('desktop.push-device-id', deviceId); }
  await fetch(new URL('/notification-devices', setup.apiUrl), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${setup.accessToken}` },
    body: JSON.stringify({ deviceId, platform: 'macos', provider: 'apns', token, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', appVersion: app.getVersion() }),
  }).catch(() => undefined);
}
