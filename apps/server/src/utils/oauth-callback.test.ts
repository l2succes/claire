import { describe, expect, test } from 'bun:test';
import { buildOAuthCallbackUrl, resolveOAuthClient } from './oauth-callback';

describe('OAuth callback routing', () => {
  test('routes iOS and Android auth sessions to the mobile scheme', () => {
    expect(resolveOAuthClient(undefined, 'Claire/1 CFNetwork iPhone OS/26.0')).toBe('mobile');
    expect(resolveOAuthClient(undefined, 'Mozilla/5.0 (Linux; Android 16)')).toBe('mobile');
  });

  test('routes desktop browsers to the desktop scheme', () => {
    expect(resolveOAuthClient(undefined, 'Mozilla/5.0 (Macintosh; Intel Mac OS X)')).toBe('desktop');
  });

  test('allows an explicit client marker to override user-agent detection', () => {
    expect(resolveOAuthClient('mobile', 'Mozilla/5.0 (Macintosh)')).toBe('mobile');
    expect(resolveOAuthClient('desktop', 'Mozilla/5.0 (iPhone)')).toBe('desktop');
  });

  test('preserves the authorization code and provider error details', () => {
    expect(buildOAuthCallbackUrl({
      userAgent: 'Mozilla/5.0 (iPhone)',
      code: 'auth-code',
    })).toBe('claire://confirm?code=auth-code');

    expect(buildOAuthCallbackUrl({
      client: 'desktop',
      error: 'access_denied',
      errorDescription: 'Login cancelled',
    })).toBe('clairedesktop://auth/callback?error=access_denied&error_description=Login+cancelled');
  });
});
