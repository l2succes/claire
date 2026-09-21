import { describe, expect, it } from 'bun:test';
import { buildOperationsUserDirectory } from './operations-user-directory';
import type { OperationsBridgeSessionRow } from './operations-bridge-sessions';

function session(overrides: Partial<OperationsBridgeSessionRow>): OperationsBridgeSessionRow {
  return {
    session_id: 'session-1',
    user_id: 'user-1',
    platform: 'whatsapp',
    status: 'connected',
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-02T00:00:00.000Z',
    last_connected_at: '2026-09-02T00:00:00.000Z',
    operations_retired_at: null,
    ...overrides,
  };
}

describe('buildOperationsUserDirectory', () => {
  it('lists every signup and joins only the current state for each platform', () => {
    const users = buildOperationsUserDirectory([
      { id: 'user-1', email: 'first@example.com', created_at: '2026-09-03T00:00:00.000Z' },
      { id: 'user-2', email: 'second@example.com', created_at: '2026-09-01T00:00:00.000Z' },
    ], [
      session({ session_id: 'old', status: 'disconnected', updated_at: '2026-09-03T00:00:00.000Z' }),
      session({ session_id: 'current', status: 'connected', updated_at: '2026-09-02T00:00:00.000Z' }),
    ], (userId) => `ref-${userId}`);

    expect(users.map((user) => user.email)).toEqual(['first@example.com', 'second@example.com']);
    expect(users[0].platforms).toEqual([{
      platform: 'whatsapp',
      state: 'connected',
      lastConnectedAt: '2026-09-02T00:00:00.000Z',
      statusChangedAt: '2026-09-02T00:00:00.000Z',
    }]);
    expect(users[1].platforms).toEqual([]);
  });

  it('keeps a retired platform visible as connection history', () => {
    const [user] = buildOperationsUserDirectory([
      { id: 'user-1', email: 'first@example.com', created_at: '2026-09-01T00:00:00.000Z', is_demo: true },
    ], [
      session({ operations_retired_at: '2026-09-04T00:00:00.000Z', status: 'disconnected' }),
    ], (userId) => `ref-${userId}`);

    expect(user.isDemo).toBe(true);
    expect(user.platforms[0].state).toBe('retired');
  });
});
