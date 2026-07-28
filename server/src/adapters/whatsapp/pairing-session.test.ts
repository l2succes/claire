import { describe, expect, test } from 'bun:test';
import {
  AuthMethod,
  Platform,
  PlatformSession,
  PlatformStatus,
} from '../types';
import {
  getPendingPairingSessions,
  selectReusablePairingSession,
} from './pairing-session';

function session(
  id: string,
  status: PlatformStatus,
  pairingCode?: string
): PlatformSession {
  return {
    id,
    userId: 'user-1',
    platform: Platform.WHATSAPP,
    status,
    authMethod: AuthMethod.PAIRING_CODE,
    authData: pairingCode ? { pairingCode } : undefined,
    createdAt: new Date(),
    capabilities: {
      canSendText: true,
      canSendMedia: true,
      canSendStickers: true,
      canSendVoice: true,
      canSendLocation: true,
      canCreateGroups: true,
      canReadReceipts: true,
      canEditMessages: true,
      canDeleteMessages: true,
      canReactToMessages: true,
      canReplyToMessages: true,
      maxMessageLength: 65536,
      supportedMediaTypes: [],
    },
  };
}

describe('WhatsApp pairing session selection', () => {
  test('only considers sessions with pending authentication states', () => {
    const sessions = [
      session('initializing', PlatformStatus.INITIALIZING),
      session('awaiting', PlatformStatus.AWAITING_AUTH),
      session('connected', PlatformStatus.CONNECTED),
      session('failed', PlatformStatus.FAILED),
    ];

    expect(getPendingPairingSessions(sessions).map(({ id }) => id)).toEqual([
      'initializing',
      'awaiting',
    ]);
  });

  test('prefers a live pending session that already has a pairing code', () => {
    const sessions = [
      session('live-without-code', PlatformStatus.INITIALIZING),
      session('live-with-code', PlatformStatus.AWAITING_AUTH, 'ABCD1234'),
    ];

    expect(selectReusablePairingSession(
      sessions,
      new Set(['live-without-code', 'live-with-code'])
    )?.id).toBe('live-with-code');
  });

  test('does not reuse a pending session without a live client', () => {
    const sessions = [
      session('stale', PlatformStatus.AWAITING_AUTH, 'EXPIRED1'),
    ];

    expect(selectReusablePairingSession(sessions, new Set())).toBeUndefined();
  });
});
