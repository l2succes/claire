/**
 * Regression tests for DM-vs-group detection per platform (issue #37).
 *
 * We create lightweight fakes for matrix-js-sdk Room/RoomMember to avoid
 * loading the full SDK in a unit test context.
 */

import { describe, it, expect } from 'bun:test';
import { MatrixRoomMapper } from './room-mapper';
import { MatrixUserMapper } from './user-mapper';
import { Platform } from '../types';

const SERVER = 'claire.local';
const userMapper = new MatrixUserMapper(SERVER);
const roomMapper = new MatrixRoomMapper(userMapper);

// ---------------------------------------------------------------------------
// Minimal fakes for matrix-js-sdk Room / RoomMember
// ---------------------------------------------------------------------------

function makeMember(userId: string) {
  return { userId } as { userId: string };
}

function makeRoom(roomId: string, members: Array<{ userId: string }>) {
  return {
    roomId,
    name: 'Test Room',
    getJoinedMembers: () => members,
  } as unknown as import('matrix-js-sdk').Room;
}

// ---------------------------------------------------------------------------
// detectRoomPlatform
// ---------------------------------------------------------------------------

describe('MatrixRoomMapper.detectRoomPlatform', () => {
  it('WA: detects WhatsApp from a ghost member', () => {
    const room = makeRoom('!wa-dm:claire.local', [
      makeMember('@claire_bot:claire.local'),
      makeMember('@whatsapp_15551234567:claire.local'),
    ]);
    expect(roomMapper.detectRoomPlatform(room)).toBe(Platform.WHATSAPP);
  });

  it('TG: detects Telegram from a ghost member', () => {
    const room = makeRoom('!tg-dm:claire.local', [
      makeMember('@claire_bot:claire.local'),
      makeMember('@_telegram_999888777:claire.local'),
    ]);
    expect(roomMapper.detectRoomPlatform(room)).toBe(Platform.TELEGRAM);
  });

  it('IG: detects Instagram from a ghost member', () => {
    const room = makeRoom('!ig-dm:claire.local', [
      makeMember('@claire_bot:claire.local'),
      makeMember('@meta_111222333:claire.local'),
    ]);
    expect(roomMapper.detectRoomPlatform(room)).toBe(Platform.INSTAGRAM);
  });

  it('returns null for a room with only bridge bots', () => {
    const room = makeRoom('!ctrl:claire.local', [
      makeMember('@claire_bot:claire.local'),
      makeMember('@whatsappbot:claire.local'),
    ]);
    expect(roomMapper.detectRoomPlatform(room)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isControlRoom
// ---------------------------------------------------------------------------

describe('MatrixRoomMapper.isControlRoom', () => {
  it('2-member room with bridge bot → control room', () => {
    const room = makeRoom('!ctrl:claire.local', [
      makeMember('@claire_bot:claire.local'),
      makeMember('@whatsappbot:claire.local'),
    ]);
    expect(roomMapper.isControlRoom(room)).toBe(true);
  });

  it('2-member room without bridge bot → not a control room', () => {
    const room = makeRoom('!dm:claire.local', [
      makeMember('@claire_bot:claire.local'),
      makeMember('@whatsapp_123:claire.local'),
    ]);
    expect(roomMapper.isControlRoom(room)).toBe(false);
  });

  it('3-member room → not a control room', () => {
    const room = makeRoom('!grp:claire.local', [
      makeMember('@claire_bot:claire.local'),
      makeMember('@whatsappbot:claire.local'),
      makeMember('@whatsapp_456:claire.local'),
    ]);
    expect(roomMapper.isControlRoom(room)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getPrimaryChatParticipant
// ---------------------------------------------------------------------------

describe('MatrixRoomMapper.getPrimaryChatParticipant', () => {
  it('WA 1:1: returns the other contact ID, skipping self ghost', () => {
    const room = makeRoom('!dm:claire.local', [
      makeMember('@claire_bot:claire.local'),
      makeMember('@whatsapp_15166100494:claire.local'),   // self ghost
      makeMember('@whatsapp_19998887776:claire.local'),   // contact
    ]);
    const result = roomMapper.getPrimaryChatParticipant(
      room,
      '@whatsapp_15166100494:claire.local'
    );
    expect(result).toBe('19998887776');
  });

  it('TG 1:1: returns the contact ID', () => {
    const room = makeRoom('!tg-dm:claire.local', [
      makeMember('@claire_bot:claire.local'),
      makeMember('@_telegram_111:claire.local'),
    ]);
    const result = roomMapper.getPrimaryChatParticipant(room, undefined);
    expect(result).toBe('111');
  });

  it('IG 1:1: returns the contact ID', () => {
    const room = makeRoom('!ig-dm:claire.local', [
      makeMember('@claire_bot:claire.local'),
      makeMember('@meta_222:claire.local'),
    ]);
    expect(roomMapper.getPrimaryChatParticipant(room, undefined)).toBe('222');
  });

  it('returns null when room has no ghost members', () => {
    const room = makeRoom('!empty:claire.local', [
      makeMember('@claire_bot:claire.local'),
      makeMember('@whatsappbot:claire.local'),
    ]);
    expect(roomMapper.getPrimaryChatParticipant(room, undefined)).toBeNull();
  });
});
