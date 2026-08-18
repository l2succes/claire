/**
 * Unit tests for the Matrix event converter's conversation-structure fields.
 *
 * These four fields (reply target, thread root, mentions, member count) are all
 * computed by the bridge and were historically dropped before the database
 * write. They are what the loops relevance model uses to answer "does this
 * group message concern me?" — see /docs/plans/loops-revamp §3.
 *
 * The matrix-js-sdk Room/MatrixEvent surfaces are duck-typed to the small
 * subset the converter actually reads.
 */

import { describe, it, expect } from 'bun:test';
import type { MatrixEvent, Room } from 'matrix-js-sdk';
import { MatrixEventConverter } from '../../src/adapters/matrix/event-converter';
import { MatrixUserMapper } from '../../src/adapters/matrix/user-mapper';
import { Platform } from '../../src/adapters/types';
import type { MatrixMessageContent } from '../../src/adapters/matrix/types';

const SERVER = 'claire.local';
const SELF_GHOST = `@whatsapp_15550000000:${SERVER}`;
const PEER_GHOST = `@whatsapp_15551234567:${SERVER}`;
const OTHER_GHOST = `@whatsapp_15559876543:${SERVER}`;
const BRIDGE_BOT = `@whatsappbot:${SERVER}`;

function makeEvent(content: Partial<MatrixMessageContent>, sender = PEER_GHOST): MatrixEvent {
  return {
    getContent: () => ({ msgtype: 'm.text', body: 'hello', ...content }),
    getSender: () => sender,
    getId: () => '$event-1',
    getDate: () => new Date('2026-08-17T12:00:00Z'),
  } as unknown as MatrixEvent;
}

function makeRoom(memberIds: string[] = [SELF_GHOST, PEER_GHOST]): Room {
  return {
    roomId: '!room:claire.local',
    name: 'Test room',
    getMember: (id: string) => ({ name: id, userId: id }),
    getJoinedMembers: () => memberIds.map((userId) => ({ userId, name: userId })),
  } as unknown as Room;
}

function convert(event: MatrixEvent, room = makeRoom()) {
  const converter = new MatrixEventConverter(new MatrixUserMapper(SERVER));
  return converter.toUnifiedMessage(event, room, 'session-1', 'user-1', Platform.WHATSAPP, SELF_GHOST);
}

describe('reply and thread relations', () => {
  it('extracts a reply target', async () => {
    const message = await convert(
      makeEvent({ 'm.relates_to': { 'm.in_reply_to': { event_id: '$target' } } }),
    );
    expect(message.replyToMessageId).toBe('$target');
    expect(message.threadRootId).toBeUndefined();
  });

  it('extracts a thread root only for m.thread relations', async () => {
    const message = await convert(
      makeEvent({ 'm.relates_to': { rel_type: 'm.thread', event_id: '$thread-root' } }),
    );
    expect(message.threadRootId).toBe('$thread-root');
  });

  it('does NOT treat a non-thread relation carrying event_id as a thread root', async () => {
    // m.replace (edits) and m.annotation (reactions) both carry event_id. Reading
    // event_id without checking rel_type would scope detection windows to an
    // edited message rather than a thread.
    const message = await convert(
      makeEvent({ 'm.relates_to': { rel_type: 'm.replace', event_id: '$edited' } }),
    );
    expect(message.threadRootId).toBeUndefined();
  });

  it('leaves both unset on an ordinary message', async () => {
    const message = await convert(makeEvent({}));
    expect(message.replyToMessageId).toBeUndefined();
    expect(message.threadRootId).toBeUndefined();
  });
});

describe('mentions', () => {
  it('carries structured mention user ids through', async () => {
    const message = await convert(
      makeEvent({ 'm.mentions': { user_ids: [SELF_GHOST, OTHER_GHOST] } }),
    );
    expect(message.mentions).toEqual([SELF_GHOST, OTHER_GHOST]);
    expect(message.mentionsRoom).toBeUndefined();
  });

  it('flags a broadcast mention', async () => {
    // @channel/@here address everyone, so this must stay distinguishable from a
    // personal mention — it is a negative relevance signal, not a positive one.
    const message = await convert(makeEvent({ 'm.mentions': { room: true } }));
    expect(message.mentionsRoom).toBe(true);
    expect(message.mentions).toBeUndefined();
  });

  it('normalises an empty mention list to undefined', async () => {
    const message = await convert(makeEvent({ 'm.mentions': { user_ids: [] } }));
    expect(message.mentions).toBeUndefined();
  });

  it('preserves formatted_body so mentions stay recoverable', async () => {
    const html = '<a href="https://matrix.to/#/@whatsapp_15550000000:claire.local">Luc</a> ping';
    const message = await convert(makeEvent({ formatted_body: html }));
    expect(message.formattedBody).toBe(html);
  });
});

describe('member count', () => {
  it('counts real members and excludes the bridge bot', async () => {
    const room = makeRoom([SELF_GHOST, PEER_GHOST, OTHER_GHOST, BRIDGE_BOT]);
    const message = await convert(makeEvent({}), room);
    expect(message.memberCount).toBe(3);
  });

  it('counts everyone present, not just distinct senders', async () => {
    // This is the point of the field: a large channel where few people post has
    // a high member count and a tiny sender-derived roster. Only the former
    // identifies it as a broadcast surface.
    const many = Array.from({ length: 60 }, (_, i) => `@whatsapp_1555000${i}:${SERVER}`);
    const message = await convert(makeEvent({}), makeRoom(many));
    expect(message.memberCount).toBe(60);
  });
});
