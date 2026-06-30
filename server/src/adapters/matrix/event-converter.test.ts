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
