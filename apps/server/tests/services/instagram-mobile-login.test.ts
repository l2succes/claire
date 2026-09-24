import { describe, expect, it, mock } from 'bun:test';
import express from 'express';
import request from 'supertest';
import { InstagramMobileLogin } from '../../src/services/instagram-mobile-login';
import { instagramMobileLoginRouter } from '../../src/routes/instagram-mobile-login';
import type { LoginStepResponse } from '../../src/adapters/matrix/bridge-http-client';

const credentials: LoginStepResponse = { login_id: 'bridge-login', step_id: 'credentials', type: 'user_input',
  user_input: { fields: [{ id: 'username', name: 'Username', type: 'username' }, { id: 'password', name: 'Password', type: 'password' }] } };
const verification: LoginStepResponse = { login_id: 'bridge-login', step_id: 'verification', txn_id: 'txn-2', type: 'user_input',
  user_input: { fields: [{ id: 'code', name: 'Code', type: '2fa_code' }] } };
const complete: LoginStepResponse = { login_id: 'bridge-login', step_id: 'done', type: 'complete', complete: { user_login_id: 'ig-user' } };
const input = { username: 'test-user', password: 'synthetic-secret' };
function setup(first = credentials) {
  let now = 1000;
  const bridge = {
    getLoginFlows: mock(async () => [{ id: 'instagram', name: 'Cookies' }, { id: 'android', name: 'Native' }]),
    startLogin: mock(async () => first), advanceLogin: mock(async (_step: LoginStepResponse, _input?: Record<string, string>) => verification),
    cancelLogin: mock(async (_id: string) => undefined),
  };
  const deps = { bridge, createSession: mock(async () => undefined), completeSession: mock(async () => undefined),
    failSession: mock(async () => undefined), now: () => now };
  return { login: new InstagramMobileLogin(deps), deps, bridge, expire: () => { now += 16 * 60_000; } };
}

describe('Instagram mobile login coordinator', () => {
  it('selects the explicit native flow, strips bridge IDs and never retains submitted credentials', async () => {
    const { login, bridge } = setup(); const start = await login.start('alice');
    expect(bridge.startLogin).toHaveBeenCalledWith('android');
    expect(start.status).toBe('awaiting_input'); expect(JSON.stringify(start)).not.toContain('bridge-login');
    const next = await login.advance('alice', start.attemptId, start.revision, input);
    expect(next.step?.type).toBe('user_input'); expect(JSON.stringify(login.status('alice', start.attemptId))).not.toContain(input.password);
  });
  it('rejects foreign ownership for status, submission and cancellation', async () => {
    const { login, bridge } = setup(); const start = await login.start('alice');
    expect(() => login.status('bob', start.attemptId)).toThrow('not found');
    await expect(login.advance('bob', start.attemptId, start.revision, input)).rejects.toThrow('not found');
    await expect(login.cancel('bob', start.attemptId)).rejects.toThrow('not found');
    expect(bridge.advanceLogin).not.toHaveBeenCalled();
  });
  it('does not reconnect or replay when retrying an old revision', async () => {
    const { login, bridge, deps } = setup(); const start = await login.start('alice');
    await login.advance('alice', start.attemptId, start.revision, input);
    await login.advance('alice', start.attemptId, start.revision, input);
    expect(bridge.advanceLogin).toHaveBeenCalledTimes(1); expect(deps.completeSession).not.toHaveBeenCalled();
  });
  it('serializes concurrent submissions and prevents start/cancel from racing completion', async () => {
    const { login, bridge, deps } = setup(); const start = await login.start('alice');
    let release!: (step: LoginStepResponse) => void;
    bridge.advanceLogin.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const pending = login.advance('alice', start.attemptId, start.revision, input);
    expect((await login.advance('alice', start.attemptId, start.revision, input)).status).toBe('working');
    await expect(login.cancel('alice', start.attemptId)).rejects.toThrow('still running');
    await expect(login.start('alice')).rejects.toThrow('still running');
    release(complete); expect((await pending).status).toBe('connected');
    expect(deps.completeSession).toHaveBeenCalledTimes(1); expect(bridge.advanceLogin).toHaveBeenCalledTimes(1);
  });
  it('validates fields and revisions before contacting the bridge', async () => {
    const { login, bridge } = setup(); const start = await login.start('alice');
    for (const bad of [null, [], { ...input, injected: 'value' }, { username: 'x', password: 3 }, { username: 'x' }]) {
      await expect(login.advance('alice', start.attemptId, start.revision, bad)).rejects.toThrow();
    }
    await expect(login.advance('alice', start.attemptId, 20, input)).rejects.toThrow('revision');
    expect(bridge.advanceLogin).not.toHaveBeenCalled();
  });
  it('accepts only listed choices', async () => {
    const { login, bridge } = setup({ ...credentials, user_input: { fields: [{ id: 'method', name: 'Method', type: 'select', options: ['SMS', 'TOTP'] }] } });
    const start = await login.start('alice');
    await expect(login.advance('alice', start.attemptId, start.revision, { method: 'fake' })).rejects.toThrow('listed');
    expect(bridge.advanceLogin).not.toHaveBeenCalled();
  });
  it('expires attempts and retires abandoned attempts on restart', async () => {
    const { login, bridge, expire } = setup(); const first = await login.start('alice');
    const second = await login.start('alice');
    expect(() => login.status('alice', first.attemptId)).toThrow('not found');
    expire(); expect(() => login.status('alice', second.attemptId)).toThrow('expired');
    expect(bridge.cancelLogin).toHaveBeenCalledTimes(2);
  });
  it('cancels without logging out an already completed bridge connection', async () => {
    const { login, bridge, deps } = setup(); const start = await login.start('alice');
    bridge.advanceLogin.mockResolvedValueOnce(complete);
    expect((await login.advance('alice', start.attemptId, start.revision, input)).status).toBe('connected');
    await login.cancel('alice', start.attemptId);
    expect(bridge.cancelLogin).not.toHaveBeenCalled(); expect(deps.failSession).not.toHaveBeenCalled();
  });
  it('fails closed on ambiguous bridge errors without exposing or replaying secrets', async () => {
    const { login, bridge, deps } = setup(); const start = await login.start('alice');
    bridge.advanceLogin.mockRejectedValueOnce(new Error('upstream password=synthetic-secret'));
    await expect(login.advance('alice', start.attemptId, start.revision, input)).rejects.toThrow('Check Instagram');
    await expect(login.advance('alice', start.attemptId, start.revision, input)).rejects.toThrow('not found');
    expect(deps.completeSession).not.toHaveBeenCalled(); expect(bridge.advanceLogin).toHaveBeenCalledTimes(1);
  });
  it('strips upstream completed-login and field default payloads', async () => {
    const { login, bridge } = setup({ ...credentials, user_input: { fields: [{ id: 'password', name: 'Password', type: 'password', default_value: 'secret-default' } as never] } });
    const start = await login.start('alice'); expect(JSON.stringify(start)).not.toContain('secret-default');
    bridge.advanceLogin.mockResolvedValueOnce({ ...complete, complete: { ...complete.complete!, user_login: { credentials: 'secret-session' } } } as never);
    const done = await login.advance('alice', start.attemptId, start.revision, { password: 'synthetic' });
    expect(JSON.stringify(done)).not.toContain('secret-session');
  });
  it('supports approval waits and passes transaction identity to the bridge', async () => {
    const wait: LoginStepResponse = { ...verification, type: 'display_and_wait', display_and_wait: { type: 'nothing' } };
    const { login, bridge } = setup(wait); const start = await login.start('alice');
    await login.advance('alice', start.attemptId, start.revision, undefined);
    expect(bridge.advanceLogin.mock.calls[0][0].txn_id).toBe('txn-2');
  });
  it('rejects unsupported methods and browser origins/scripts before exposing them', async () => {
    const fields = [{ id: 'sessionid', required: true, sources: [{ type: 'cookie', name: 'sessionid', cookie_domain: 'instagram.com' }] }];
    for (const step of [
      { ...credentials, type: 'client_http' }, { ...credentials, type: 'webauthn' },
      { ...credentials, type: 'cookies', cookies: { url: 'https://instagram.com.evil.test/', fields } },
      { ...credentials, type: 'cookies', cookies: { url: 'http://instagram.com/', fields } },
      { ...credentials, type: 'cookies', cookies: { url: 'https://instagram.com/', fields, extract_js: 'alert(1)' } },
    ]) {
      const { login, deps } = setup(step as LoginStepResponse);
      await expect(login.start('alice')).rejects.toThrow(); expect(deps.completeSession).not.toHaveBeenCalled();
    }
  });
  it('accepts a cookie-only HTTPS challenge and validates its required fields', async () => {
    const { login, bridge } = setup({ ...credentials, type: 'cookies', cookies: { url: 'https://www.instagram.com/challenge/',
      fields: [{ id: 'sessionid', required: true, sources: [{ type: 'cookie', name: 'sessionid', cookie_domain: 'instagram.com' }] }] } });
    const start = await login.start('alice');
    await expect(login.advance('alice', start.attemptId, start.revision, {})).rejects.toThrow('fields');
    bridge.advanceLogin.mockResolvedValueOnce(complete);
    expect((await login.advance('alice', start.attemptId, start.revision, { sessionid: 'synthetic-cookie' })).status).toBe('connected');
  });
});

describe('Instagram mobile login HTTP boundary', () => {
  it('requires authentication, the explicit single-user flag and no-store responses', async () => {
    const originalEnabled = process.env.INSTAGRAM_MOBILE_LOGIN_ENABLED;
    const originalUser = process.env.INSTAGRAM_MOBILE_LOGIN_USER_ID;
    try {
      process.env.INSTAGRAM_MOBILE_LOGIN_ENABLED = 'true'; process.env.INSTAGRAM_MOBILE_LOGIN_USER_ID = 'alice';
      const { login } = setup(); const app = express(); app.use(express.json());
      app.use((req, _res, next) => { if (req.header('x-test-user')) req.user = { id: req.header('x-test-user')! } as never; next(); });
      app.use(instagramMobileLoginRouter(login));
      expect((await request(app).post('/start')).status).toBe(401);
      expect((await request(app).post('/start').set('x-test-user', 'bob')).status).toBe(404);
      const start = await request(app).post('/start').set('x-test-user', 'alice');
      expect(start.status).toBe(200); expect(start.headers['cache-control']).toBe('no-store');
      process.env.INSTAGRAM_MOBILE_LOGIN_ENABLED = 'false';
      expect((await request(app).get('/capabilities').set('x-test-user', 'alice')).status).toBe(404);
    } finally {
      if (originalEnabled === undefined) delete process.env.INSTAGRAM_MOBILE_LOGIN_ENABLED; else process.env.INSTAGRAM_MOBILE_LOGIN_ENABLED = originalEnabled;
      if (originalUser === undefined) delete process.env.INSTAGRAM_MOBILE_LOGIN_USER_ID; else process.env.INSTAGRAM_MOBILE_LOGIN_USER_ID = originalUser;
    }
  });
});
