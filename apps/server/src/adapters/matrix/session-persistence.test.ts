import { describe, expect, it } from 'bun:test';
import { AuthMethod, Platform, PlatformCapabilities, PlatformSession, PlatformStatus } from '../types';
import { fromPersistedMatrixSession, toPersistedMatrixSession } from './session-persistence';

const capabilities: PlatformCapabilities = {
  canSendText: true,
  canSendMedia: true,
  canSendStickers: true,
  canSendVoice: true,
  canSendLocation: false,
  canCreateGroups: false,
  canReadReceipts: true,
  canEditMessages: false,
  canDeleteMessages: false,
  canReactToMessages: true,
  canReplyToMessages: true,
  maxMessageLength: 65536,
  supportedMediaTypes: [],
};

describe('Matrix durable session metadata', () => {
  const session: PlatformSession = {
    id: 'instagram-user-123',
    userId: 'user-123',
    platform: Platform.INSTAGRAM,
    status: PlatformStatus.CONNECTED,
    authMethod: AuthMethod.QR_CODE,
    platformUserId: 'ig-user-7',
    selfGhostId: '@meta_ig-user-7:claire.local',
    selfGhostIds: ['@meta_ig-user-7:claire.local'],
    matrixUserId: '@claire_bot:claire.local',
    authData: { token: 'one-time-secret' },
    createdAt: new Date('2026-08-13T12:00:00.000Z'),
    lastConnectedAt: new Date('2026-08-13T12:01:00.000Z'),
    capabilities,
  };

  it('persists identity metadata but never ephemeral auth data', () => {
    const row = toPersistedMatrixSession(session);

    expect(row.session_data).toEqual({
      authMethod: AuthMethod.QR_CODE,
      selfGhostId: '@meta_ig-user-7:claire.local',
      selfGhostIds: ['@meta_ig-user-7:claire.local'],
      matrixUserId: '@claire_bot:claire.local',
    });
    expect(JSON.stringify(row)).not.toContain('one-time-secret');
  });

  it('restores a connected session with its exact sender identities', () => {
    const restored = fromPersistedMatrixSession({
      ...toPersistedMatrixSession(session),
      created_at: '2026-08-13T12:00:00.000Z',
    }, capabilities);

    expect(restored).toMatchObject({
      id: session.id,
      platform: Platform.INSTAGRAM,
      status: PlatformStatus.CONNECTED,
      selfGhostIds: ['@meta_ig-user-7:claire.local'],
    });
    expect(restored?.authData).toBeUndefined();
  });

  it('rejects an unknown platform row', () => {
    expect(fromPersistedMatrixSession({
      ...toPersistedMatrixSession(session),
      platform: 'unknown',
    }, capabilities)).toBeNull();
  });
});
