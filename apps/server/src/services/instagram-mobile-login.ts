import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers';
import type { BridgeHttpClient, LoginStepResponse } from '../adapters/matrix/bridge-http-client';

export class InstagramMobileLoginError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

type Bridge = Pick<BridgeHttpClient, 'getLoginFlows' | 'startLogin' | 'advanceLogin' | 'cancelLogin'>;
type Dependencies = {
  bridge: Bridge;
  createSession(userId: string, sessionId: string): Promise<void>;
  completeSession(sessionId: string, loginId: string): Promise<void>;
  failSession(sessionId: string): Promise<void>;
  now?: () => number;
};
type Attempt = {
  id: string; userId: string; sessionId: string; expiresAt: number; revision: number;
  step?: LoginStepResponse; busy: boolean; failed: boolean; committed: boolean;
};
const TTL = 15 * 60_000;
const fail = (status: number, message: string): never => { throw new InstagramMobileLoginError(status, message); };

/** Staging-only, one process and one allowlisted user. No submitted secrets are retained. */
export class InstagramMobileLogin {
  private attempts = new Map<string, Attempt>();
  private starting = false;
  private readonly now: () => number;

  constructor(private deps: Dependencies, private flowId: 'android' | 'instagram-password' = 'android') {
    this.now = deps.now ?? Date.now;
  }

  async available(): Promise<boolean> {
    return (await this.deps.bridge.getLoginFlows()).some(flow => flow.id === this.flowId);
  }

  private get(userId: string, id: string): Attempt {
    const attempt = this.attempts.get(id);
    if (!attempt || attempt.userId !== userId) return fail(404, 'Sign-in not found. Start again.');
    if (attempt.expiresAt <= this.now()) {
      if (attempt.busy) return fail(409, 'A sign-in request is still running. Please wait.');
      void this.retire(attempt);
      return fail(410, 'Sign-in expired. Start again.');
    }
    if (attempt.failed) return fail(410, 'This sign-in ended. Start again.');
    return attempt;
  }

  private async retire(attempt: Attempt): Promise<void> {
    this.attempts.delete(attempt.id);
    if (attempt.committed) return;
    // Never log a bridge error: upstream errors may contain request contents.
    if (attempt.step) await this.deps.bridge.cancelLogin(attempt.step.login_id).catch(() => undefined);
    await this.deps.failSession(attempt.sessionId).catch(() => undefined);
  }

  async start(userId: string) {
    if (this.starting || [...this.attempts.values()].some(a => a.busy)) {
      return fail(409, 'A sign-in request is still running. Please wait.');
    }
    this.starting = true;
    let attempt: Attempt | undefined;
    try {
      if (!await this.available()) return fail(503, 'Mobile Instagram sign-in is not enabled on this bridge yet.');
      for (const old of this.attempts.values()) {
        if (old.userId === userId || old.expiresAt <= this.now()) await this.retire(old);
      }
      const id = randomUUID();
      attempt = { id, userId, sessionId: `instagram-${userId}-${id}`, expiresAt: this.now() + TTL,
        revision: 0, busy: true, failed: false, committed: false };
      await this.deps.createSession(userId, attempt.sessionId);
      this.attempts.set(id, attempt);
      const expiry = setTimeout(() => { if (attempt && !attempt.busy) void this.retire(attempt); }, TTL + 120_000);
      (expiry as unknown as { unref(): void }).unref();
      await this.accept(attempt, await this.deps.bridge.startLogin(this.flowId));
      attempt.busy = false;
      return this.snapshot(attempt);
    } catch (error) {
      if (attempt) await this.retire(attempt);
      if (error instanceof InstagramMobileLoginError) throw error;
      return fail(502, 'Could not start Instagram sign-in. Try again later.');
    } finally {
      if (attempt) attempt.busy = false;
      this.starting = false;
    }
  }

  status(userId: string, id: string) { return this.snapshot(this.get(userId, id)); }

  async advance(userId: string, id: string, revision: unknown, input: unknown) {
    const attempt = this.get(userId, id);
    if (!Number.isInteger(revision) || (revision as number) < 0 || (revision as number) > attempt.revision) {
      return fail(400, 'Invalid sign-in revision.');
    }
    // A lost response can be recovered without submitting the password/code twice.
    if (attempt.busy || revision !== attempt.revision || attempt.committed) return this.snapshot(attempt);
    const step = attempt.step!;
    if (step.type === 'complete') return this.snapshot(attempt);
    const values = this.validateInput(step, input);
    attempt.busy = true;
    try {
      await this.accept(attempt, await this.deps.bridge.advanceLogin(step, values));
    } catch (error) {
      // Network errors have an ambiguous outcome. Do not replay a credential submission.
      attempt.failed = true;
      await this.retire(attempt);
      if (error instanceof InstagramMobileLoginError) throw error;
      return fail(502, 'Instagram could not finish this step. Check Instagram, then start a new sign-in.');
    } finally {
      attempt.busy = false;
    }
    return this.snapshot(attempt);
  }

  async cancel(userId: string, id: string) {
    const attempt = this.get(userId, id);
    if (attempt.busy) return fail(409, 'A sign-in request is still running. Please wait.');
    await this.retire(attempt);
  }

  private validateInput(step: LoginStepResponse, input: unknown): Record<string, string> | undefined {
    if (step.type === 'display_and_wait') return undefined;
    if (!input || typeof input !== 'object' || Array.isArray(input)) return fail(400, 'Sign-in fields are required.');
    const fields = step.type === 'user_input' ? step.user_input!.fields : step.cookies!.fields;
    const values = input as Record<string, unknown>;
    if (Object.keys(values).some(key => !fields.some(f => f.id === key))) return fail(400, 'Unknown sign-in field.');
    for (const field of fields) {
      const value = values[field.id];
      const required = 'required' in field ? field.required : true;
      if (value === undefined && !required) continue;
      if (typeof value !== 'string' || value.length > 16_384 || (required && !value.length)) {
        return fail(400, 'Complete the requested sign-in fields.');
      }
      if ('options' in field && field.options?.length && !field.options.includes(value)) return fail(400, 'Choose a listed option.');
    }
    return values as Record<string, string>;
  }

  private async accept(attempt: Attempt, step: LoginStepResponse) {
    if (!step.login_id || !step.step_id || (attempt.step && attempt.step.login_id !== step.login_id)) {
      return fail(502, 'Instagram returned an invalid sign-in step.');
    }
    // Whitelist response metadata. In particular, never return complete.user_login
    // (which can contain bridge credentials), field defaults, or executable extract_js.
    const clean: LoginStepResponse = { login_id: step.login_id, step_id: step.step_id,
      txn_id: step.txn_id, type: step.type, instructions: step.instructions?.slice(0, 2000) };
    attempt.step = clean;
    if (step.type === 'complete' && step.complete?.user_login_id) {
      clean.complete = { user_login_id: step.complete.user_login_id };
      await this.deps.completeSession(attempt.sessionId, step.complete.user_login_id);
      attempt.committed = true;
    } else if (step.type === 'user_input' && step.user_input?.fields.length) {
      const supported = ['username', 'email', 'password', '2fa_code', 'select', 'phone_number', 'captcha_code'];
      if (step.user_input.fields.length > 8 || step.user_input.fields.some(f => !supported.includes(f.type))) {
        return fail(422, 'Instagram requested a sign-in method this build does not support yet.');
      }
      clean.user_input = { fields: step.user_input.fields.map(({ id, type, name, description, options }) => ({ id, type, name, description, options })) };
    } else if (step.type === 'display_and_wait' && step.display_and_wait?.type === 'nothing') {
      clean.display_and_wait = { type: 'nothing' };
    } else if (step.type === 'cookies' && step.cookies && isInstagramURL(step.cookies.url)
      && !step.cookies.extract_js && step.cookies.fields.length > 0
      && step.cookies.fields.every(f => f.sources.every(s => s.type === 'cookie'
        && s.name && s.cookie_domain?.replace(/^\./, '') === 'instagram.com'))) {
      clean.cookies = { url: step.cookies.url, fields: step.cookies.fields,
        wait_for_url_pattern: step.cookies.wait_for_url_pattern };
    } else {
      return fail(422, 'Instagram requested a browser or verification step this build does not support yet. Finish it in Instagram, then try again.');
    }
    attempt.revision++;
  }

  private snapshot(attempt: Attempt) {
    const step = attempt.step;
    return { attemptId: attempt.id, sessionId: attempt.sessionId, revision: attempt.revision,
      expiresAt: attempt.expiresAt, status: attempt.committed ? 'connected' : attempt.busy ? 'working' : 'awaiting_input',
      // IDs used for upstream calls remain on the server.
      step: step ? { type: step.type, instructions: step.instructions, user_input: step.user_input,
        cookies: step.cookies, display_and_wait: step.display_and_wait } : undefined };
  }
}

function isInstagramURL(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443')
      && (url.hostname === 'instagram.com' || url.hostname.endsWith('.instagram.com'));
  } catch { return false; }
}
