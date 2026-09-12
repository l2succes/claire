/**
 * The demo gate's fail-safe, and unread derivation.
 *
 * The gate test matters more than it looks: it asserts that with
 * DEMO_MODE_ENABLED unset — the state of every real deployment — the gate
 * answers "no" without reaching the database at all. That is the property that
 * makes it safe to ship this code alongside real traffic.
 */

import { describe, expect, it } from 'bun:test';

import { isDemoModeEnabled, isDemoUser } from './demo-accounts';
import { countTrailingIncoming } from './unread';

describe('demo gate', () => {
  it('is disabled by default', () => {
    // .env.test does not set DEMO_MODE_ENABLED, matching a real deployment.
    expect(isDemoModeEnabled()).toBe(false);
  });

  it('refuses every account while the deployment has not opted in', async () => {
    // No Supabase is reachable in this suite, so a passing assertion here also
    // proves the short-circuit happens before any query is attempted.
    expect(await isDemoUser('aaaaaaaa-0000-4000-8000-000000000001')).toBe(false);
  });

  it('refuses a missing account identifier', async () => {
    expect(await isDemoUser(undefined)).toBe(false);
    expect(await isDemoUser(null)).toBe(false);
    expect(await isDemoUser('')).toBe(false);
  });
});

describe('countTrailingIncoming', () => {
  it('counts the run of incoming messages at the end of a thread', () => {
    expect(
      countTrailingIncoming([
        { from_me: false },
        { from_me: true },
        { from_me: false },
        { from_me: false },
      ])
    ).toBe(2);
  });

  it('returns zero when the account owner had the last word', () => {
    expect(countTrailingIncoming([{ from_me: false }, { from_me: true }])).toBe(0);
  });

  it('counts an entirely incoming thread', () => {
    expect(countTrailingIncoming([{ from_me: false }, { from_me: false }])).toBe(2);
  });

  it('handles an empty tail', () => {
    expect(countTrailingIncoming([])).toBe(0);
  });

  it('treats a row with no from_me as incoming', () => {
    expect(countTrailingIncoming([{ from_me: true }, {}])).toBe(1);
  });
});
