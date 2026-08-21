import { describe, expect, it } from 'bun:test';
import { REDACTED, redactForOperations, safeErrorCode } from './redaction';

describe('redactForOperations', () => {
  it('removes content, credentials, identities, and raw error stacks', () => {
    const result = redactForOperations({
      component: 'matrix',
      content: 'private message text',
      payload: { body: 'another private message', access_token: 'eyJ-super-secret-token-value' },
      userEmail: 'person@example.com',
      error: Object.assign(new Error('provider said: private message text'), { code: 'M_FORBIDDEN' }),
    }) as Record<string, unknown>;

    expect(result.component).toBe('matrix');
    expect(result.content).toBe(REDACTED);
    expect(result.payload).toBe(REDACTED);
    expect(result.userEmail).toBe(REDACTED);
    expect(result.error).toEqual({ name: 'Error', code: 'M_FORBIDDEN' });
    expect(JSON.stringify(result)).not.toContain('private message text');
    expect(JSON.stringify(result)).not.toContain('eyJ-super-secret-token-value');
  });

  it('keeps bounded machine-readable error codes', () => {
    expect(safeErrorCode({ code: 'PGRST116' })).toBe('PGRST116');
    expect(safeErrorCode(new Error('private message'))).toBe('internal_error');
  });

  it('removes Expo device tokens from free-form diagnostic strings', () => {
    expect(redactForOperations('push failed for ExpoPushToken[private-device-token]')).not.toContain('private-device-token');
  });
});
