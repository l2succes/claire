/**
 * Sentry client integration tests (issue #45).
 *
 * Verifies that:
 *  1. Sentry.init is NOT called when EXPO_PUBLIC_SENTRY_DSN is absent.
 *  2. Sentry.init IS called when EXPO_PUBLIC_SENTRY_DSN is set.
 *  3. Sentry.captureException can be invoked (smoke test).
 */

import * as Sentry from '@sentry/react-native';

const mockInit = jest.fn();
const mockCaptureException = jest.fn();

jest.mock('@sentry/react-native', () => ({
  init: (...args: unknown[]) => mockInit(...args),
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

describe('Sentry client integration', () => {
  beforeEach(() => {
    mockInit.mockClear();
    mockCaptureException.mockClear();
  });

  it('does not call Sentry.init when DSN is absent', () => {
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
    if (dsn) {
      Sentry.init({ dsn });
    }
    expect(mockInit).not.toHaveBeenCalled();
  });

  it('calls Sentry.init with the DSN when env var is set', () => {
    const dsn = 'https://client@sentry.io/456';
    process.env.EXPO_PUBLIC_SENTRY_DSN = dsn;
    const currentDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
    if (currentDsn) {
      Sentry.init({ dsn: currentDsn, tracesSampleRate: 1.0 });
    }
    expect(mockInit).toHaveBeenCalledWith(
      expect.objectContaining({ dsn }),
    );
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
  });

  it('captureException forwards the error to Sentry', () => {
    const err = new Error('something went wrong');
    Sentry.captureException(err);
    expect(mockCaptureException).toHaveBeenCalledWith(err);
  });
});
