/**
 * Demo responder behaviour.
 *
 * Runs with no AI provider configured, which exercises the path that matters
 * most for filming: when generation is unavailable the persona still answers,
 * in voice, rather than leaving a dead chat on screen.
 */

import { describe, expect, it } from 'bun:test';

import { Platform, UnifiedMessage } from '../adapters/types';
import { incomingContactId } from './contact-identity';
import { DEMO_CHATS, DEMO_FALLBACK_REPLIES, DEMO_PERSONAS_BY_KEY } from '../demo/personas';
import {
  chooseResponder,
  parseReplyBubbles,
  DemoResponder,
  type HistoryLine,
} from './demo-responder';

const USER = 'cccccccc-0000-4000-8000-000000000003';

const FAST = {
  burstDebounceMs: 5,
  thinkMinMs: 1,
  thinkMaxMs: 2,
  bubbleGapMinMs: 1,
  bubbleGapMaxMs: 2,
};

const amaraChat = DEMO_CHATS.find((chat) => chat.key === 'amara')!;
const footballChat = DEMO_CHATS.find((chat) => chat.key === 'football')!;

function responder(history: HistoryLine[] = []) {
  const ingested: UnifiedMessage[] = [];
  const instance = new DemoResponder({
    loadHistory: async () => history,
    delays: FAST,
  });
  instance.configure(async (message) => {
    ingested.push(message);
  });
  return { instance, ingested };
}

async function waitFor(predicate: () => boolean, timeoutMs = 1_500): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('Timed out waiting for the persona to reply');
}

describe('parseReplyBubbles', () => {
  const amara = DEMO_PERSONAS_BY_KEY.amara;

  it('splits on a bare --- line', () => {
    expect(parseReplyBubbles('ok\n---\nwait actually no', amara)).toEqual(['ok', 'wait actually no']);
  });

  it('strips a leading speaker label', () => {
    expect(parseReplyBubbles('Amara Okonkwo: sounds good', amara)).toEqual(['sounds good']);
    expect(parseReplyBubbles('Amara: sounds good', amara)).toEqual(['sounds good']);
  });

  it('unwraps surrounding quotes and markdown emphasis', () => {
    expect(parseReplyBubbles('"sounds good"', amara)).toEqual(['sounds good']);
    expect(parseReplyBubbles('that is **great**', amara)).toEqual(['that is great']);
  });

  it('caps the number of bubbles', () => {
    expect(parseReplyBubbles('one\n---\ntwo\n---\nthree', amara)).toHaveLength(2);
  });

  it('drops empty segments and whitespace-only output', () => {
    expect(parseReplyBubbles('ok\n---\n   \n', amara)).toEqual(['ok']);
    expect(parseReplyBubbles('   ', amara)).toEqual([]);
  });
});

describe('chooseResponder', () => {
  it('picks the only participant in a one-to-one chat', () => {
    expect(chooseResponder(amaraChat, 'hey', [])?.key).toBe('amara');
  });

  it('prefers a participant named in the message', () => {
    expect(chooseResponder(footballChat, 'rahim can you book the pitch', [])?.key).toBe('rahim');
  });

  it('otherwise answers as whoever spoke last', () => {
    const history: HistoryLine[] = [
      { fromMe: false, senderName: 'Rahim Osei', content: 'bibs?' },
      { fromMe: false, senderName: 'Tunde Bakare', content: 'i can bring them' },
    ];
    expect(chooseResponder(footballChat, 'thanks', history)?.key).toBe('tunde');
  });

  it('ignores the account owner when looking for the last speaker', () => {
    const history: HistoryLine[] = [
      { fromMe: false, senderName: 'Rahim Osei', content: 'bibs?' },
      { fromMe: true, senderName: null, content: 'I can grab bibs' },
    ];
    expect(chooseResponder(footballChat, 'see you saturday', history)?.key).toBe('rahim');
  });

  it('returns null when a chat has no known participants', () => {
    expect(chooseResponder({ ...footballChat, participants: ['nobody'] }, 'hi', [])).toBeNull();
  });
});

describe('respondTo', () => {
  it('replies in voice when no model is available', async () => {
    const { instance, ingested } = responder();
    instance.respondTo({
      userId: USER,
      platform: Platform.WHATSAPP,
      chatId: amaraChat.platformChatId,
      content: 'picked a place, thai on grand st',
    });

    await waitFor(() => ingested.length > 0);
    expect(DEMO_FALLBACK_REPLIES.amara).toContain(ingested[0].content);
  });

  it('delivers the reply as an unread incoming message from the persona', async () => {
    const { instance, ingested } = responder();
    instance.respondTo({
      userId: USER,
      platform: Platform.WHATSAPP,
      chatId: amaraChat.platformChatId,
      content: 'hey',
    });

    await waitFor(() => ingested.length > 0);
    const reply = ingested[0];
    expect(reply.isFromMe).toBe(false);
    // Unread on purpose: a live reply should raise a badge and a push.
    expect(reply.isRead).toBe(false);
    expect(reply.senderName).toBe('Amara Okonkwo');
    // The sender must be a bridge ghost MXID, not a bare phone number, or
    // ingestion attaches no contact to the reply.
    expect(incomingContactId(reply)).toBe(DEMO_PERSONAS_BY_KEY.amara.platformContactId);
    expect(reply.userId).toBe(USER);
    expect(reply.platformMetadata?.demo).toBe(true);
    // Live replies must NOT be backfill, or they would raise no notification.
    expect(reply.platformMetadata?.syncKind).toBeUndefined();
  });

  it('answers a burst of messages once', async () => {
    const { instance, ingested } = responder();
    const request = {
      userId: USER,
      platform: Platform.WHATSAPP,
      chatId: amaraChat.platformChatId,
      content: 'one',
    };
    instance.respondTo(request);
    instance.respondTo({ ...request, content: 'two' });
    instance.respondTo({ ...request, content: 'three' });

    await waitFor(() => ingested.length > 0);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(ingested).toHaveLength(1);
  });

  it('says nothing when the demo user writes to a chat with no cast member', async () => {
    const { instance, ingested } = responder();
    instance.respondTo({
      userId: USER,
      platform: Platform.WHATSAPP,
      chatId: '15559999999',
      content: 'anyone there?',
    });

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(ingested).toHaveLength(0);
  });

  it('does nothing when the ingestion path has not been wired up', async () => {
    const instance = new DemoResponder({ loadHistory: async () => [], delays: FAST });
    expect(instance.isConfigured).toBe(false);
    instance.respondTo({
      userId: USER,
      platform: Platform.WHATSAPP,
      chatId: amaraChat.platformChatId,
      content: 'hello?',
    });
    await new Promise((resolve) => setTimeout(resolve, 40));
    // No throw, no delivery.
    expect(instance.isConfigured).toBe(false);
  });

  it('stops replying once the per-account cap is reached', async () => {
    const { instance, ingested } = responder();
    // Each chat is debounced separately, so sending to many chats is what
    // actually exercises the cap rather than the debounce.
    for (const chat of DEMO_CHATS) {
      instance.respondTo({
        userId: USER,
        platform: chat.platform,
        chatId: chat.platformChatId,
        content: 'hello',
      });
    }
    await waitFor(() => ingested.length >= DEMO_CHATS.length, 2_000);
    expect(ingested.length).toBeLessThanOrEqual(24);
  });

  it('cancels scheduled replies on reset', async () => {
    const { instance, ingested } = responder();
    instance.respondTo({
      userId: USER,
      platform: Platform.WHATSAPP,
      chatId: amaraChat.platformChatId,
      content: 'hello',
    });
    instance.reset();
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(ingested).toHaveLength(0);
  });
});
