import { BrowserWindow, session } from 'electron';
import { randomUUID } from 'node:crypto';
import type { InstagramLoginRequest, InstagramLoginResult } from './shared/ipc';

const REQUIRED_COOKIE = 'sessionid';

function validRequest(value: unknown): value is InstagramLoginRequest {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as InstagramLoginRequest;
  try { return /^https?:\/\//.test(new URL(candidate.apiUrl).toString()) && candidate.accessToken.length > 20; } catch { return false; }
}

/**
 * Cookie capture happens entirely in the isolated Electron session. The
 * renderer receives only a success/error result and never sees browser cookies.
 */
export async function startInstagramLogin(value: unknown): Promise<InstagramLoginResult> {
  if (!validRequest(value)) return { success: false, error: 'Sign-in context is invalid. Please sign in again.' };
  const response = await fetch(new URL('/platforms/instagram/login/start', value.apiUrl), {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${value.accessToken}` }, body: JSON.stringify({ client: 'web' }),
  });
  if (!response.ok) return { success: false, error: 'Could not start Instagram sign-in.' };
  const start = await response.json() as { sessionId: string; loginId: string; stepId: string; loginUrl?: string };
  const partition = `claire-instagram-${randomUUID()}`;
  const isolated = session.fromPartition(partition, { cache: false });

  return new Promise((resolve) => {
    let settled = false;
    const finish = async (result: InstagramLoginResult) => {
      if (settled) return;
      settled = true;
      await isolated.clearStorageData().catch(() => undefined);
      resolve(result);
    };
    const window = new BrowserWindow({ width: 520, height: 720, title: 'Connect Instagram', autoHideMenuBar: true, webPreferences: { partition, contextIsolation: true, nodeIntegration: false, sandbox: true } });
    window.on('closed', () => { void finish({ success: false, error: 'Instagram sign-in was cancelled.' }); });
    window.webContents.on('did-navigate', async (_event, url) => {
      if (!/instagram\.com/i.test(url)) return;
      const cookies = await isolated.cookies.get({ domain: '.instagram.com' });
      const sessionCookie = cookies.find((cookie) => cookie.name === REQUIRED_COOKIE);
      if (!sessionCookie) return;
      const payload = { sessionId: start.sessionId, loginId: start.loginId, stepId: start.stepId, cookies: Object.fromEntries(cookies.map((cookie) => [cookie.name, cookie.value])) };
      const submit = await fetch(new URL('/platforms/instagram/login/submit', value.apiUrl), { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${value.accessToken}` }, body: JSON.stringify(payload) });
      if (submit.ok) { window.destroy(); await finish({ success: true }); }
    });
    void window.loadURL(start.loginUrl || 'https://www.instagram.com/accounts/login/');
  });
}
