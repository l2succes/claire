/**
 * Demo fixture integrity.
 *
 * These are content tests as much as code tests. The failure they exist to
 * catch is a script edit that quietly breaks a demo — a persona key typo that
 * silences a participant, or a clock time that resolves into the future and
 * sorts a message above everything else in the inbox.
 */

import { describe, expect, it } from 'bun:test';

import { Platform } from '../adapters/types';
import { incomingContactId } from '../services/contact-identity';
import {
  buildDemoChatHistory,
  buildDemoChats,
  buildDemoContacts,
  buildDemoMessages,
  buildDemoSessions,
  demoFixtureSummary,
  demoGhostId,
  demoSessionId,
  isDemoSessionId,
  parseDemoSessionId,
  DEMO_PLATFORMS,
} from './fixtures';
import {
  DEMO_CHATS,
  DEMO_FALLBACK_REPLIES,
  DEMO_PERSONAS,
  DEMO_PERSONAS_BY_KEY,
  DEMO_TIMEZONE,
  resolveScriptTime,
} from './personas';

const USER = '11111111-2222-3333-4444-555555555555';

describe('demo session identifiers', () => {
  it('round-trips platform and owner', () => {
    const sessionId = demoSessionId(Platform.TELEGRAM, USER);
    expect(parseDemoSessionId(sessionId)).toEqual({ platform: Platform.TELEGRAM, userId: USER });
  });

  it('rejects identifiers that are not demo sessions', () => {
    expect(parseDemoSessionId('matrix-session-abc')).toBeNull();
    expect(parseDemoSessionId('')).toBeNull();
    expect(isDemoSessionId('whatsapp-1234')).toBe(false);
  });

  it('rejects a platform the demo account does not present', () => {
    expect(parseDemoSessionId(`demo-session-slack-${USER}`)).toBeNull();
  });

  it('rejects a well-formed prefix with no owner', () => {
    expect(parseDemoSessionId('demo-session-whatsapp-')).toBeNull();
  });
});

describe('demo sessions', () => {
  it('presents one connected session per demo platform', () => {
    const sessions = buildDemoSessions(USER);
    expect(sessions).toHaveLength(DEMO_PLATFORMS.length);
    expect(sessions.every((session) => session.status === 'connected')).toBe(true);
    expect(sessions.every((session) => session.userId === USER)).toBe(true);
  });

  it('backdates the connection so it does not read as brand new', () => {
    const now = new Date('2026-09-12T15:00:00Z');
    const [session] = buildDemoSessions(USER, now);
    expect(session.createdAt.getTime()).toBeLessThan(now.getTime() - 7 * 86_400_000);
  });
});

describe('demo script integrity', () => {
  it('every scripted sender is either the user or a known persona', () => {
    for (const chat of DEMO_CHATS) {
      for (const line of chat.script) {
        if (line.from === 'me') continue;
        expect(DEMO_PERSONAS_BY_KEY[line.from], `${chat.key}: unknown sender "${line.from}"`).toBeDefined();
      }
    }
  });

  it('every participant is a known persona', () => {
    for (const chat of DEMO_CHATS) {
      for (const participant of chat.participants) {
        expect(DEMO_PERSONAS_BY_KEY[participant], `${chat.key}: unknown participant`).toBeDefined();
      }
    }
  });

  it('only group chats speak for more than one person', () => {
    for (const chat of DEMO_CHATS) {
      const speakers = new Set(chat.script.filter((line) => line.from !== 'me').map((line) => line.from));
      if (!chat.isGroup) {
        expect(chat.participants).toHaveLength(1);
        expect([...speakers]).toEqual(chat.participants);
      } else {
        expect(chat.participants.length).toBeGreaterThan(1);
      }
    }
  });

  it('gives every persona a fallback line', () => {
    for (const persona of DEMO_PERSONAS) {
      expect(DEMO_FALLBACK_REPLIES[persona.key]?.length, `${persona.key} has no fallback`).toBeGreaterThan(0);
    }
  });

  it('keeps every persona on a platform the demo account presents', () => {
    for (const persona of DEMO_PERSONAS) {
      expect(DEMO_PLATFORMS).toContain(persona.platform);
    }
  });

  it('never puts a persona in a room on another platform', () => {
    // A persona's contact identity is minted from the *chat's* platform, so a
    // participant from a different platform silently creates a second contact
    // for the same person — a duplicate in the People screen with no avatar.
    for (const chat of DEMO_CHATS) {
      for (const key of chat.participants) {
        const persona = DEMO_PERSONAS_BY_KEY[key];
        expect(
          persona.platform,
          `${chat.key} is a ${chat.platform} chat but ${key} is on ${persona.platform}`
        ).toBe(chat.platform);
      }
    }
  });

  it('has a distinct platform identifier per persona', () => {
    const ids = DEMO_PERSONAS.map((persona) => `${persona.platform}:${persona.platformContactId}`);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('demo message construction', () => {
  const now = new Date('2026-09-12T15:00:00Z');

  it('never produces a timestamp in the future', () => {
    for (const message of buildDemoMessages(USER, now)) {
      expect(message.timestamp.getTime()).toBeLessThan(now.getTime());
    }
  });

  it('returns messages in ascending time order', () => {
    const messages = buildDemoMessages(USER, now);
    for (let index = 1; index < messages.length; index += 1) {
      expect(messages[index].timestamp.getTime()).toBeGreaterThanOrEqual(
        messages[index - 1].timestamp.getTime()
      );
    }
  });

  it('is deterministic in its platform identifiers, so re-seeding cannot duplicate', () => {
    // Identifiers, not order: relative ordering legitimately shifts with the
    // seed time, but the identifier set must not, because ingestion dedupes on it.
    const first = buildDemoMessages(USER, now).map((message) => message.platformMessageId);
    const second = buildDemoMessages(USER, new Date('2026-10-01T09:00:00Z')).map(
      (message) => message.platformMessageId
    );
    expect(new Set(first)).toEqual(new Set(second));
    expect(new Set(first).size).toBe(first.length);
  });

  it('keeps a morning clock time in the morning when seeded before it', () => {
    // Seeded at 05:00 New York, a scripted 08:15 line has not happened yet. It
    // should move to 08:15 yesterday rather than collapsing onto "2 minutes ago".
    const earlyMorning = new Date('2026-09-12T09:00:00Z');
    const resolved = resolveScriptTime({ from: 'me', text: 'x', daysAgo: 0, at: '08:15' }, earlyMorning);
    const hourInZone = Number(
      new Intl.DateTimeFormat('en-US', {
        timeZone: DEMO_TIMEZONE,
        hour: '2-digit',
        hour12: false,
      }).format(resolved)
    );
    expect(hourInZone).toBe(8);
    expect(resolved.getTime()).toBeLessThan(earlyMorning.getTime());
  });

  it('marks scripted history as backfill so a replay raises no notifications', () => {
    for (const message of buildDemoMessages(USER, now)) {
      expect(message.platformMetadata?.syncKind).toBe('backfill');
    }
  });

  it('attributes group messages to their speaker, not the account owner', () => {
    const group = DEMO_CHATS.find((chat) => chat.isGroup);
    expect(group).toBeDefined();
    const history = buildDemoChatHistory(group!.platformChatId, USER, now);
    const incoming = history.filter((message) => !message.isFromMe);
    expect(incoming.length).toBeGreaterThan(0);
    expect(new Set(incoming.map((message) => message.senderName)).size).toBeGreaterThan(1);
    expect(incoming.every((message) => message.chatType === 'group')).toBe(true);
  });

  it('scopes history to the requested chat', () => {
    const history = buildDemoChatHistory(DEMO_CHATS[0].platformChatId, USER, now);
    expect(history.length).toBe(DEMO_CHATS[0].script.length);
    expect(buildDemoChatHistory('does-not-exist', USER, now)).toEqual([]);
  });

  it('leaves at least one thread ending on an unanswered incoming message', () => {
    // This is what the inbox's "needs reply" state is built from; a script edit
    // that answers every thread would quietly remove the surface.
    const unanswered = DEMO_CHATS.filter((chat) => chat.script.at(-1)?.from !== 'me');
    expect(unanswered.length).toBeGreaterThan(0);
  });
});

describe('contact derivation through the real ingestion helpers', () => {
  const now = new Date('2026-09-12T15:00:00Z');

  // Ingestion reads a contact out of the sender's Matrix ghost MXID. A fixture
  // carrying a bare phone number instead would ingest every message with no
  // contact attached — chats would still appear, so the break would only show
  // up as an empty People screen and missing avatars. These assertions run the
  // production helper over the fixtures rather than trusting their shape.
  it('resolves a platform contact id for every incoming demo message', () => {
    const incoming = buildDemoMessages(USER, now).filter((message) => !message.isFromMe);
    expect(incoming.length).toBeGreaterThan(0);
    for (const message of incoming) {
      expect(
        incomingContactId(message),
        `${message.platformMessageId} has an unreadable sender: ${message.senderId}`
      ).toBeTruthy();
    }
  });

  it('resolves the sender to the persona it was scripted for', () => {
    const messages = buildDemoMessages(USER, now);
    const amara = DEMO_PERSONAS_BY_KEY.amara;
    const fromAmara = messages.find((message) => message.senderName === amara.displayName);
    expect(fromAmara).toBeDefined();
    expect(incomingContactId(fromAmara!)).toBe(amara.platformContactId);
  });

  it('attaches no contact to the account owner\'s own messages', () => {
    const outgoing = buildDemoMessages(USER, now).filter((message) => message.isFromMe);
    expect(outgoing.length).toBeGreaterThan(0);
    for (const message of outgoing) {
      expect(incomingContactId(message)).toBeNull();
    }
  });

  it('builds a ghost identity in the shape each bridge emits', () => {
    expect(demoGhostId(Platform.WHATSAPP, '15550138871')).toMatch(/^@whatsapp_15550138871:/);
    expect(demoGhostId(Platform.TELEGRAM, '584120993')).toMatch(/^@_telegram_584120993:/);
    expect(demoGhostId(Platform.INSTAGRAM, '17841409922104')).toMatch(/^@meta_17841409922104:/);
  });
});

describe('demo chats and contacts', () => {
  it('builds one chat per scripted conversation with a last-message time', () => {
    const chats = buildDemoChats(USER);
    expect(chats).toHaveLength(DEMO_CHATS.length);
    expect(chats.every((chat) => chat.lastMessageAt instanceof Date)).toBe(true);
  });

  it('builds one contact per persona, carrying an avatar', () => {
    const contacts = buildDemoContacts(USER);
    expect(contacts).toHaveLength(DEMO_PERSONAS.length);
    expect(contacts.every((contact) => Boolean(contact.avatarUrl))).toBe(true);
    expect(contacts.every((contact) => contact.userId === USER)).toBe(true);
  });

  it('summarises the pack', () => {
    const summary = demoFixtureSummary();
    expect(summary.personas).toBe(DEMO_PERSONAS.length);
    expect(summary.chats).toBe(DEMO_CHATS.length);
    expect(summary.groups).toBeGreaterThan(0);
    expect(summary.messages).toBeGreaterThan(50);
  });
});
