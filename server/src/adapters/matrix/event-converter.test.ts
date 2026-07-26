/**
 * Regression tests for isGroupRoom / extractChatId per platform (issue #37).
 *
 * We exercise the MatrixEventConverter's DM-vs-group detection logic using
 * lightweight fakes (no real matrix-js-sdk instantiation needed).
 */

import { describe, it, expect } from 'bun:test';
import { MatrixEventConverter } from './event-converter';
import { MatrixUserMapper } from './user-mapper';
import { Platform } from '../types';

const SERVER = 'claire.local';
const userMapper = new MatrixUserMapper(SERVER);
const converter = new MatrixEventConverter(userMapper);

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

function makeMember(userId: string) {
  return { userId } as { userId: string };
}

function makeRoom(
  roomId: string,
  roomName: string,
  members: Array<{ userId: string }>
) {
  return {
    roomId,
    name: roomName,
    getMember: (_uid: string) => null,
    getJoinedMembers: () => members,
  } as unknown as import('matrix-js-sdk').Room;
}

function makeEvent(senderId: string, body: string, msgtype = 'm.text') {
  return {
    getContent: () => ({ msgtype, body }),
    getSender: () => senderId,
    getId: () => 'evt-001',
    getDate: () => new Date('2025-01-01T00:00:00Z'),
  } as unknown as import('matrix-js-sdk').MatrixEvent;
}

// ---------------------------------------------------------------------------
// WhatsApp — DM
// ---------------------------------------------------------------------------

describe('WhatsApp DM (1:1)', () => {
  const selfGhost = '@whatsapp_15166100494:claire.local';
  const otherGhost = '@whatsapp_19998887776:claire.local';
  const room = makeRoom('!wa-dm:claire.local', 'Jane Doe', [
    makeMember('@claire_bot:claire.local'),
    makeMember(selfGhost),
    makeMember(otherGhost),
  ]);

  it('chatType is individual', async () => {
    const event = makeEvent(otherGhost, 'hello');
    const msg = await converter.toUnifiedMessage(
      event,
      room,
      'sess1',
      'user1',
      Platform.WHATSAPP,
      selfGhost
    );
    expect(msg.chatType).toBe('individual');
  });

  it('chatId is the other contact phone number', async () => {
    const event = makeEvent(otherGhost, 'hello');
    const msg = await converter.toUnifiedMessage(
      event,
      room,
      'sess1',
      'user1',
      Platform.WHATSAPP,
      selfGhost
    );
    expect(msg.chatId).toBe('19998887776');
  });

  it('isFromMe is false for messages from the other side', async () => {
    const event = makeEvent(otherGhost, 'hello');
    const msg = await converter.toUnifiedMessage(
      event,
      room,
      'sess1',
      'user1',
      Platform.WHATSAPP,
      selfGhost
    );
    expect(msg.isFromMe).toBe(false);
  });

  it('isFromMe is true for messages from own ghost', async () => {
    const event = makeEvent(selfGhost, 'hi back');
    const msg = await converter.toUnifiedMessage(
      event,
      room,
      'sess1',
      'user1',
      Platform.WHATSAPP,
      selfGhost
    );
    expect(msg.isFromMe).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// WhatsApp — Group
// ---------------------------------------------------------------------------

describe('WhatsApp Group', () => {
  const selfGhost = '@whatsapp_15166100494:claire.local';
  const member1 = '@whatsapp_19998887776:claire.local';
  const member2 = '@whatsapp_18887776665:claire.local';
  const room = makeRoom('!wa-grp:claire.local', 'Family Group', [
    makeMember('@claire_bot:claire.local'),
    makeMember(selfGhost),
    makeMember(member1),
    makeMember(member2),
  ]);

  it('chatType is group', async () => {
    const event = makeEvent(member1, 'hey group');
    const msg = await converter.toUnifiedMessage(
      event,
      room,
      'sess1',
      'user1',
      Platform.WHATSAPP,
      selfGhost
    );
    expect(msg.chatType).toBe('group');
  });

  it('chatId is the room ID for groups', async () => {
    const event = makeEvent(member1, 'hey group');
    const msg = await converter.toUnifiedMessage(
      event,
      room,
      'sess1',
      'user1',
      Platform.WHATSAPP,
      selfGhost
    );
    expect(msg.chatId).toBe('!wa-grp:claire.local');
  });
});

// ---------------------------------------------------------------------------
// WhatsApp — LID duplicates (mautrix v2 accounts)
// A room that has both phone and LID ghosts for the same contacts must still
// be counted as a DM (only one unique phone-based contact, ignoring LID).
// ---------------------------------------------------------------------------

describe('WhatsApp LID de-duplication', () => {
  const selfGhost = '@whatsapp_15166100494:claire.local';
  // Same contact, once as phone ghost, once as LID ghost
  const phoneGhost = '@whatsapp_19998887776:claire.local';
  const lidGhost = '@whatsapp_lid-1234567890123456789:claire.local';
  const room = makeRoom('!wa-lid-dm:claire.local', 'John (WA)', [
    makeMember('@claire_bot:claire.local'),
    makeMember(selfGhost),
    makeMember(phoneGhost),
    makeMember(lidGhost),
  ]);

  it('chatType is individual (phone count takes precedence over LID count)', async () => {
    const event = makeEvent(phoneGhost, 'yo');
    const msg = await converter.toUnifiedMessage(
      event,
      room,
      'sess1',
      'user1',
      Platform.WHATSAPP,
      selfGhost
    );
    expect(msg.chatType).toBe('individual');
  });
});

// ---------------------------------------------------------------------------
// Telegram — DM
// ---------------------------------------------------------------------------

describe('Telegram DM', () => {
  const otherGhost = '@_telegram_999888777:claire.local';
  const room = makeRoom('!tg-dm:claire.local', 'Tg User', [
    makeMember('@claire_bot:claire.local'),
    makeMember(otherGhost),
  ]);

  it('chatType is individual', async () => {
    const event = makeEvent(otherGhost, 'hi tg');
    const msg = await converter.toUnifiedMessage(
      event,
      room,
      'sess1',
      'user1',
      Platform.TELEGRAM,
      undefined
    );
    expect(msg.chatType).toBe('individual');
  });

  it('chatId is the telegram user id', async () => {
    const event = makeEvent(otherGhost, 'hi tg');
    const msg = await converter.toUnifiedMessage(
      event,
      room,
      'sess1',
      'user1',
      Platform.TELEGRAM,
      undefined
    );
    expect(msg.chatId).toBe('999888777');
  });
});

// ---------------------------------------------------------------------------
// Telegram — Group
// ---------------------------------------------------------------------------

describe('Telegram Group', () => {
  const tg1 = '@_telegram_111:claire.local';
  const tg2 = '@_telegram_222:claire.local';
  const room = makeRoom('!tg-grp:claire.local', 'TG Group', [
    makeMember('@claire_bot:claire.local'),
    makeMember(tg1),
    makeMember(tg2),
  ]);

  it('chatType is group', async () => {
    const event = makeEvent(tg1, 'group msg');
    const msg = await converter.toUnifiedMessage(
      event,
      room,
      'sess1',
      'user1',
      Platform.TELEGRAM,
      undefined
    );
    expect(msg.chatType).toBe('group');
  });
});

// ---------------------------------------------------------------------------
// Instagram / Meta — DM
// ---------------------------------------------------------------------------

describe('Instagram DM', () => {
  const igGhost = '@meta_111222333:claire.local';
  const room = makeRoom('!ig-dm:claire.local', 'IG User', [
    makeMember('@claire_bot:claire.local'),
    makeMember(igGhost),
  ]);

  it('chatType is individual', async () => {
    const event = makeEvent(igGhost, 'dm on ig');
    const msg = await converter.toUnifiedMessage(
      event,
      room,
      'sess1',
      'user1',
      Platform.INSTAGRAM,
      undefined
    );
    expect(msg.chatType).toBe('individual');
  });

  it('chatId is the meta user id', async () => {
    const event = makeEvent(igGhost, 'dm on ig');
    const msg = await converter.toUnifiedMessage(
      event,
      room,
      'sess1',
      'user1',
      Platform.INSTAGRAM,
      undefined
    );
    expect(msg.chatId).toBe('111222333');
  });
});

// ---------------------------------------------------------------------------
// Instagram / Meta — Group
// ---------------------------------------------------------------------------

describe('Instagram Group', () => {
  const ig1 = '@meta_111:claire.local';
  const ig2 = '@meta_222:claire.local';
  const room = makeRoom('!ig-grp:claire.local', 'IG Group', [
    makeMember('@claire_bot:claire.local'),
    makeMember(ig1),
    makeMember(ig2),
  ]);

  it('chatType is group', async () => {
    const event = makeEvent(ig1, 'group ig');
    const msg = await converter.toUnifiedMessage(
      event,
      room,
      'sess1',
      'user1',
      Platform.INSTAGRAM,
      undefined
    );
    expect(msg.chatType).toBe('group');
  });
});

// ---------------------------------------------------------------------------
// Double puppeting — isFromMe with real Matrix user ID (issue #33)
//
// When double-puppeting is enabled, the bridge sends outgoing-from-phone
// messages as the user's real Matrix account instead of a ghost user.
// The matrixUserId parameter passed to toUnifiedMessage identifies this sender.
// ---------------------------------------------------------------------------

describe('Double puppeting — WhatsApp DM', () => {
  const selfGhost = '@whatsapp_15166100494:claire.local';
  const botUserId = '@claire_bot:claire.local';
  const otherGhost = '@whatsapp_19998887776:claire.local';
  const room = makeRoom('!wa-dp-dm:claire.local', 'Jane', [
    makeMember(botUserId),
    makeMember(otherGhost),
    // Note: no selfGhost in room when double-puppeting is fully active
  ]);

  it('isFromMe is true when sender is the real Matrix user (double-puppet)', async () => {
    // With double-puppeting, bot user appears as sender for own messages
    const event = makeEvent(botUserId, 'hey from phone');
    const msg = await converter.toUnifiedMessage(
      event,
      room,
      'sess1',
      'user1',
      Platform.WHATSAPP,
      selfGhost,    // selfGhostId still passed for fallback
      botUserId     // matrixUserId = real Matrix user for this session
    );
    expect(msg.isFromMe).toBe(true);
  });

  it('isFromMe is false for messages from the other side (double-puppet mode)', async () => {
    const event = makeEvent(otherGhost, 'reply');
    const msg = await converter.toUnifiedMessage(
      event,
      room,
      'sess1',
      'user1',
      Platform.WHATSAPP,
      selfGhost,
      botUserId
    );
    expect(msg.isFromMe).toBe(false);
  });

  it('isDoublePuppetUser: returns false for ghost user', () => {
    expect(userMapper.isDoublePuppetUser('@whatsapp_123:claire.local', botUserId)).toBe(false);
  });

  it('isDoublePuppetUser: returns false for bridge bot', () => {
    expect(userMapper.isDoublePuppetUser('@whatsappbot:claire.local', botUserId)).toBe(false);
  });

  it('isDoublePuppetUser: returns true for exact matrixUserId match', () => {
    expect(userMapper.isDoublePuppetUser('@claire_bot:claire.local', '@claire_bot:claire.local')).toBe(true);
  });

  it('isDoublePuppetUser: returns false when matrixUserId differs from sender', () => {
    expect(userMapper.isDoublePuppetUser('@other_user:claire.local', '@claire_bot:claire.local')).toBe(false);
  });
});

describe('Double puppeting — Telegram DM', () => {
  const botUserId = '@claire_bot:claire.local';
  const tgOther = '@_telegram_999888777:claire.local';
  const room = makeRoom('!tg-dp-dm:claire.local', 'TG User', [
    makeMember(botUserId),
    makeMember(tgOther),
  ]);

  it('isFromMe is true when real Matrix user sent (Telegram, double-puppet)', async () => {
    const event = makeEvent(botUserId, 'tg reply from phone');
    const msg = await converter.toUnifiedMessage(
      event,
      room,
      'sess1',
      'user1',
      Platform.TELEGRAM,
      undefined,    // no selfGhost for Telegram without double-puppet baseline
      botUserId
    );
    expect(msg.isFromMe).toBe(true);
  });
});

describe('Double puppeting — Instagram DM', () => {
  const botUserId = '@claire_bot:claire.local';
  const igOther = '@meta_111222333:claire.local';
  const room = makeRoom('!ig-dp-dm:claire.local', 'IG User', [
    makeMember(botUserId),
    makeMember(igOther),
  ]);

  it('isFromMe is true when real Matrix user sent (Instagram, double-puppet)', async () => {
    const event = makeEvent(botUserId, 'ig reply from phone');
    const msg = await converter.toUnifiedMessage(
      event,
      room,
      'sess1',
      'user1',
      Platform.INSTAGRAM,
      undefined,
      botUserId
    );
    expect(msg.isFromMe).toBe(true);
  });
});
