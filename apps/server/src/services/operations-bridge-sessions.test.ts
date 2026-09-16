import { describe, expect, it } from 'bun:test';
import {
  classifyOperationsBridgeSessions,
  type OperationsBridgeSessionRow,
} from './operations-bridge-sessions';

function row(overrides: Partial<OperationsBridgeSessionRow>): OperationsBridgeSessionRow {
  return {
    session_id: 'session-default',
    user_id: 'user-1',
    platform: 'whatsapp',
    status: 'disconnected',
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    last_connected_at: null,
    operations_retired_at: null,
    ...overrides,
  };
}

describe('classifyOperationsBridgeSessions', () => {
  it('treats an old disconnected row as superseded when a replacement is connected', () => {
    const sessions = classifyOperationsBridgeSessions([
      row({ session_id: 'old', status: 'disconnected', updated_at: '2026-09-01T00:00:00.000Z' }),
      row({ session_id: 'current', status: 'connected', updated_at: '2026-08-01T00:00:00.000Z' }),
    ]);

    expect(sessions.find((session) => session.session_id === 'old')?.lifecycleState).toBe('superseded');
    expect(sessions.find((session) => session.session_id === 'current')?.lifecycleState).toBe('connected');
  });

  it('only treats the newest failed attempt as actionable when no connection exists', () => {
    const sessions = classifyOperationsBridgeSessions([
      row({ session_id: 'older', platform: 'instagram', status: 'failed', updated_at: '2026-08-01T00:00:00.000Z' }),
      row({ session_id: 'newer', platform: 'instagram', status: 'disconnected', updated_at: '2026-08-02T00:00:00.000Z' }),
    ]);

    expect(sessions.find((session) => session.session_id === 'older')?.lifecycleState).toBe('superseded');
    expect(sessions.find((session) => session.session_id === 'newer')?.lifecycleState).toBe('attention');
  });

  it('keeps retired rows visible but never actionable', () => {
    const [session] = classifyOperationsBridgeSessions([
      row({ operations_retired_at: '2026-09-15T00:00:00.000Z' }),
    ]);

    expect(session.lifecycleState).toBe('retired');
    expect(session.isCurrent).toBe(false);
  });
});

