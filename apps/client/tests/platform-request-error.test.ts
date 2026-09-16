import { PlatformRequestError } from '../services/api-errors';

describe('outgoing retry classification', () => {
  it.each([undefined, 401, 408, 429, 500, 502, 503])('retries temporary failure %s', (status) => {
    expect(new PlatformRequestError('safe message', status).retryable).toBe(true);
  });
  it.each(['Session not connected', 'Session not found', 'Message not found', 'Reply target is unavailable in this conversation'])('waits for %s', (reason) => {
    expect(new PlatformRequestError('safe message', 400, reason).retryable).toBe(true);
  });
  it.each([400, 403, 404, 409, 422])('leaves permanent failure %s for user action', (status) => {
    expect(new PlatformRequestError('safe message', status, 'Unsupported operation').retryable).toBe(false);
  });
});
