/** Local-only live bridge probe. The user enters Instagram credentials in the native iOS sheet. */
import express from 'express';
import { readFileSync } from 'node:fs';
import { InstagramMobileLogin, InstagramMobileLoginError } from '../src/services/instagram-mobile-login';
import type { LoginStepResponse } from '../src/adapters/matrix/bridge-http-client';

const bot = JSON.parse(readFileSync('/tmp/claire-ig-local-bot.json', 'utf8')) as { user_id: string };
const provisioning = JSON.parse(readFileSync('/tmp/claire-instagram-mobile-stack/provisioning.json', 'utf8')) as { secret: string };
const base = 'http://127.0.0.1:29329/_matrix/provision/v3';
const auth = 'Bearer local-live-instagram';
const owner = 'local-live-test';

async function bridge<T>(method: string, path: string, input?: unknown, txnId?: string): Promise<T> {
  const url = new URL(base + path);
  url.searchParams.set('user_id', bot.user_id);
  if (txnId) url.searchParams.set('txn_id', txnId);
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${provisioning.secret}`, 'Content-Type': 'application/json' },
    body: input === undefined ? undefined : JSON.stringify(input),
    signal: AbortSignal.timeout(90_000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`Bridge HTTP ${response.status}`);
  return result as T;
}

const login = new InstagramMobileLogin({
  bridge: {
    async getLoginFlows() { const result = await bridge<{ flows: { id: string; name: string }[] }>('GET', '/login/flows'); return result.flows; },
    startLogin: () => bridge<LoginStepResponse>('POST', '/login/start/android'),
    advanceLogin: (step, input) => bridge<LoginStepResponse>(
      'POST', `/login/step/${encodeURIComponent(step.login_id)}/${encodeURIComponent(step.step_id)}/${step.type}`,
      input, step.txn_id,
    ),
    cancelLogin: async (id) => { await bridge('POST', `/login/cancel/${encodeURIComponent(id)}`); },
  },
  async createSession() {},
  async completeSession() { console.info('Real Instagram bridge login completed.'); },
  async failSession() {},
});

const app = express();
app.use(express.json({ limit: '32kb' }));
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.header('authorization') !== auth) return res.status(401).json({ error: 'Local test token required' });
  return next();
});
const prefix = '/platforms/instagram/mobile-login';
const handle = (work: (req: express.Request) => unknown) => async (req: express.Request, res: express.Response) => {
  try { res.json(await work(req)); }
  catch (error) {
    res.status(error instanceof InstagramMobileLoginError ? error.status : 502).json({
      error: error instanceof InstagramMobileLoginError ? error.message : 'Instagram sign-in could not finish this step.',
    });
  }
};
app.get(prefix + '/capabilities', handle(async () => ({ available: await login.available() })));
app.post(prefix + '/start', handle(() => login.start(owner)));
app.get(prefix + '/:id', handle(req => login.status(owner, req.params.id)));
app.post(prefix + '/:id/advance', handle(req => login.advance(owner, req.params.id, req.body?.revision, req.body?.input)));
app.post(prefix + '/:id/cancel', handle(async req => { await login.cancel(owner, req.params.id); return { cancelled: true }; }));
app.listen(3309, '127.0.0.1', () => console.info('Live Instagram bridge probe listening on Simulator loopback port 3309.'));
