/**
 * Regression tests for per-platform self-ghost user ID patterns and DM/group detection.
 *
 * Acceptance: Regression tests pass for WA/TG/IG (issue #37).
 */

import { describe, it, expect } from 'bun:test';
import { MatrixUserMapper } from './user-mapper';
import { Platform } from '../types';
import { GHOST_USER_PREFIXES } from './types';

const SERVER = 'claire.local';
const mapper = new MatrixUserMapper(SERVER);

// ---------------------------------------------------------------------------
// Ghost user prefix constants
// ---------------------------------------------------------------------------

describe('GHOST_USER_PREFIXES', () => {
  it('WhatsApp prefix is whatsapp_', () => {
    expect(GHOST_USER_PREFIXES[Platform.WHATSAPP]).toBe('whatsapp_');
  });

  it('Telegram prefix is _telegram_', () => {
    expect(GHOST_USER_PREFIXES[Platform.TELEGRAM]).toBe('_telegram_');
  });

  it('Instagram/Meta prefix is meta_', () => {
    expect(GHOST_USER_PREFIXES[Platform.INSTAGRAM]).toBe('meta_');
  });

  it('iMessage prefix is _imessage_', () => {
    expect(GHOST_USER_PREFIXES[Platform.IMESSAGE]).toBe('_imessage_');
  });
});

// ---------------------------------------------------------------------------
// platformContactToGhostUser — self-ghost ID construction
// ---------------------------------------------------------------------------

describe('MatrixUserMapper.platformContactToGhostUser', () => {
  it('WA: constructs self-ghost ID for a phone number', () => {
    expect(mapper.platformContactToGhostUser('15166100494', Platform.WHATSAPP)).toBe(
      '@whatsapp_15166100494:claire.local'
    );
  });

  it('TG: constructs self-ghost ID for a telegram user id', () => {
    expect(mapper.platformContactToGhostUser('123456789', Platform.TELEGRAM)).toBe(
      '@_telegram_123456789:claire.local'
    );
  });

  it('IG: constructs self-ghost ID for a meta user id', () => {
    expect(mapper.platformContactToGhostUser('987654321', Platform.INSTAGRAM)).toBe(
      '@meta_987654321:claire.local'
    );
  });
});

// ---------------------------------------------------------------------------
// ghostUserToPlatformContact — self-ghost ID parsing
// ---------------------------------------------------------------------------

describe('MatrixUserMapper.ghostUserToPlatformContact', () => {
  const fixtures: Array<{
    userId: string;
    platform: Platform;
    contactId: string;
  }> = [
    // WhatsApp — phone number
    {
      userId: '@whatsapp_15166100494:claire.local',
      platform: Platform.WHATSAPP,
      contactId: '15166100494',
    },
    // WhatsApp — LID (v2 accounts)
    {
      userId: '@whatsapp_lid-1234567890123456789:claire.local',
      platform: Platform.WHATSAPP,
      contactId: 'lid-1234567890123456789',
    },
    // Telegram
    {
      userId: '@_telegram_123456789:claire.local',
      platform: Platform.TELEGRAM,
      contactId: '123456789',
    },
    // Instagram / Meta
    {
      userId: '@meta_987654321:claire.local',
      platform: Platform.INSTAGRAM,
      contactId: '987654321',
    },
    // iMessage — email address
    {
      userId: '@_imessage_user@example.com:claire.local',
      platform: Platform.IMESSAGE,
      contactId: 'user@example.com',
    },
    // iMessage — phone number
    {
      userId: '@_imessage_+15556667777:claire.local',
      platform: Platform.IMESSAGE,
      contactId: '+15556667777',
    },
  ];

  for (const { userId, platform, contactId } of fixtures) {
    it(`parses ${userId}`, () => {
      const result = mapper.ghostUserToPlatformContact(userId);
      expect(result).not.toBeNull();
      expect(result!.platform).toBe(platform);
      expect(result!.platformContactId).toBe(contactId);
    });
  }

  it('returns null for a real user (non-ghost)', () => {
    expect(mapper.ghostUserToPlatformContact('@claire_bot:claire.local')).toBeNull();
  });

  it('returns null for a bridge bot', () => {
    expect(mapper.ghostUserToPlatformContact('@whatsappbot:claire.local')).toBeNull();
  });

  it('returns null for a user on a different server', () => {
    expect(mapper.ghostUserToPlatformContact('@whatsapp_123:other.server')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isGhostUser
// ---------------------------------------------------------------------------

describe('MatrixUserMapper.isGhostUser', () => {
  it('WA ghost → true', () => {
    expect(mapper.isGhostUser('@whatsapp_15166100494:claire.local')).toBe(true);
  });

  it('TG ghost → true', () => {
    expect(mapper.isGhostUser('@_telegram_123:claire.local')).toBe(true);
  });

  it('IG ghost → true', () => {
    expect(mapper.isGhostUser('@meta_456:claire.local')).toBe(true);
  });

  it('bridge bot → false', () => {
    expect(mapper.isGhostUser('@whatsappbot:claire.local')).toBe(false);
  });

  it('admin bot → false', () => {
    expect(mapper.isGhostUser('@claire_bot:claire.local')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// detectPlatformFromUser
// ---------------------------------------------------------------------------

describe('MatrixUserMapper.detectPlatformFromUser', () => {
  it('detects WhatsApp from ghost user', () => {
    expect(mapper.detectPlatformFromUser('@whatsapp_15166100494:claire.local')).toBe(
      Platform.WHATSAPP
    );
  });

  it('detects Telegram from ghost user', () => {
    expect(mapper.detectPlatformFromUser('@_telegram_123:claire.local')).toBe(
      Platform.TELEGRAM
    );
  });

  it('detects Instagram from ghost user', () => {
    expect(mapper.detectPlatformFromUser('@meta_456:claire.local')).toBe(Platform.INSTAGRAM);
  });

  it('returns null for non-ghost user', () => {
    expect(mapper.detectPlatformFromUser('@claire_bot:claire.local')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isBridgeBot
// ---------------------------------------------------------------------------

describe('MatrixUserMapper.isBridgeBot', () => {
  it('whatsappbot → true', () => {
    expect(mapper.isBridgeBot('@whatsappbot:claire.local')).toBe(true);
  });

  it('telegrambot → true', () => {
    expect(mapper.isBridgeBot('@telegrambot:claire.local')).toBe(true);
  });

  it('metabot → true', () => {
    expect(mapper.isBridgeBot('@metabot:claire.local')).toBe(true);
  });

  it('imessagebot → true', () => {
    expect(mapper.isBridgeBot('@imessagebot:claire.local')).toBe(true);
  });

  it('ghost user → false', () => {
    expect(mapper.isBridgeBot('@whatsapp_123:claire.local')).toBe(false);
  });
});
