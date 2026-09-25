/** Local-only Simulator fixture. Accepts only synthetic literal values; never contacts Instagram. */
import express from 'express';
import { InstagramMobileLogin } from '../src/services/instagram-mobile-login';
import type { LoginStepResponse } from '../src/adapters/matrix/bridge-http-client';

const loginID = 'synthetic-login';
const login = new InstagramMobileLogin({
  bridge: {
    async getLoginFlows() { return [{ id: 'android', name: 'Synthetic' }]; },
    async startLogin(): Promise<LoginStepResponse> {
      return { login_id: loginID, step_id: 'credentials', type: 'user_input', instructions: 'SYNTHETIC TEST: use fixture for both fields. Do not enter real credentials.',
        user_input: { fields: [{ id: 'username', type: 'username', name: 'Username' }, { id: 'password', type: 'password', name: 'Password' }] } };
    },
    async advanceLogin(step, input): Promise<LoginStepResponse> {
      if (step.step_id === 'credentials' && input?.username === 'fixture' && input?.password === 'fixture') {
        return { login_id: loginID, step_id: 'code', type: 'user_input', instructions: 'SYNTHETIC TEST: enter 123456.',
          user_input: { fields: [{ id: 'code', type: '2fa_code', name: 'Verification code' }] } };
      }
      if (step.step_id === 'code' && input?.code === '123456') {
        return { login_id: loginID, step_id: 'complete', type: 'complete', complete: { user_login_id: 'synthetic-user' } };
      }
      throw new Error('Only fixture values are accepted');
    },
    async cancelLogin() {},
  },
  async createSession() {}, async completeSession() {}, async failSession() {},
});
const app = express(); app.use(express.json({ limit: '32kb' }));
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.header('authorization') !== 'Bearer synthetic-fixture') return res.status(401).json({ error: 'Fixture token required' });
  return next();
});
const prefix = '/platforms/instagram/mobile-login';
app.post(prefix + '/start', async (_req, res) => { res.json(await login.start('fixture')); });
app.get(prefix + '/:id', (req, res) => {
  try { res.json(login.status('fixture', req.params.id)); } catch { res.status(410).json({ error: 'Synthetic sign-in ended.' }); }
});
app.post(prefix + '/:id/advance', async (req, res) => {
  try { res.json(await login.advance('fixture', req.params.id, req.body.revision, req.body.input)); }
  catch { res.status(400).json({ error: 'Synthetic test only. Use fixture / fixture and code 123456.' }); }
});
app.post(prefix + '/:id/cancel', async (req, res) => {
  try { await login.cancel('fixture', req.params.id); res.json({ cancelled: true }); }
  catch { res.status(409).json({ error: 'Synthetic request still running.' }); }
});
const port = Number(process.env.INSTAGRAM_FIXTURE_PORT || '3309');
app.listen(port, '127.0.0.1', () => console.info(`Synthetic Instagram fixture listening on loopback port ${port}. No real credentials.`));
