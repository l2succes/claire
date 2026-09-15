import {
  EMPTY_TIMELINE,
  TIMELINE_WINDOW,
  keepPendingReactions,
  mergeRealtimeMessage,
  mergeServerTimeline,
  type ChatTimeline,
} from '../src/timeline';
import type { ChatMessage, ReactionRow } from '../src/types';
import type { ReactionsByMessage } from '../src/reactions';

const at = (minute: number) =>
  `2026-08-17T10:${String(minute).padStart(2, '0')}:00.000Z`;

const message = (over: Partial<ChatMessage> & { id: string }): ChatMessage => ({
  content: 'hello',
  timestamp: at(0),
  from_me: false,
  ...over,
});

const reaction = (over: Partial<ReactionRow> & { id: string }): ReactionRow => ({
  message_id: 'server-1',
  emoji: '❤️',
  from_me: true,
  ...over,
});

const timeline = (
  messages: ChatMessage[],
  reactions: ReactionsByMessage = {},
): ChatTimeline => ({ messages, reactions });

describe('mergeServerTimeline', () => {
  it('returns the page unchanged when there is nothing cached', () => {
    const incoming = timeline([message({ id: 'a' })]);
    expect(mergeServerTimeline(undefined, incoming)).toBe(incoming);
  });

  it('carries an in-flight send across a page that does not contain it', () => {
    const pending = message({
      id: 'optimistic-1',
      content: 'still sending',
      from_me: true,
      timestamp: at(5),
    });
    const merged = mergeServerTimeline(
      timeline([message({ id: 'a', timestamp: at(1) }), pending]),
      timeline([message({ id: 'a', timestamp: at(1) })]),
    );
    expect(merged.messages.map((m) => m.id)).toEqual(['a', 'optimistic-1']);
  });

  it('drops the optimistic copy once the server echoes it, keeping the server id', () => {
    const merged = mergeServerTimeline(
      timeline([
        message({ id: 'optimistic-1', content: 'sent it', from_me: true, timestamp: at(5) }),
      ]),
      timeline([message({ id: 'server-9', content: 'sent it', from_me: true, timestamp: at(5) })]),
    );
    expect(merged.messages.map((m) => m.id)).toEqual(['server-9']);
  });

  it('rescues a realtime row newer than the page, so a slow refetch cannot erase it', () => {
    // The fetch snapshotted at :01, the row landed at :09, the response arrives last.
    const merged = mergeServerTimeline(
      timeline([message({ id: 'a', timestamp: at(1) }), message({ id: 'late', timestamp: at(9) })]),
      timeline([message({ id: 'a', timestamp: at(1) })]),
    );
    expect(merged.messages.map((m) => m.id)).toEqual(['a', 'late']);
  });

  it('does not rescue a cached row that falls inside the page window', () => {
    // 'dropped' is older than the page's newest row, so the server's omission is
    // authoritative — it was deleted, not raced.
    const merged = mergeServerTimeline(
      timeline([
        message({ id: 'dropped', timestamp: at(2) }),
        message({ id: 'b', timestamp: at(4) }),
      ]),
      timeline([message({ id: 'b', timestamp: at(4) })]),
    );
    expect(merged.messages.map((m) => m.id)).toEqual(['b']);
  });
});

describe('keepPendingReactions', () => {
  it('keeps an optimistic reaction the server has not seen yet', () => {
    const optimistic = reaction({ id: 'optimistic-reaction-1' });
    const next = keepPendingReactions({}, { 'server-1': [optimistic] });
    expect(next['server-1']).toEqual([optimistic]);
  });

  it('prefers the confirmed row over an equivalent optimistic one', () => {
    // The regression this guards: re-adding every local row unconditionally lets
    // upsertReactionRow match the confirmed row on (from_me, emoji) and spread the
    // optimistic one over it, replacing a real id with 'optimistic-reaction-1'.
    // Verified to fail without the `settled` check in keepPendingReactions.
    const confirmed = reaction({ id: 'server-reaction-1' });
    const optimistic = reaction({ id: 'optimistic-reaction-1' });
    const next = keepPendingReactions(
      { 'server-1': [confirmed] },
      { 'server-1': [optimistic] },
    );
    expect(next['server-1'].map((row) => row.id)).toEqual(['server-reaction-1']);
  });

  it('ignores non-local rows in the cached set', () => {
    const server = { 'server-1': [reaction({ id: 'server-reaction-1' })] };
    expect(keepPendingReactions(server, { 'server-1': [reaction({ id: 'stale-server-2', emoji: '👍' })] })).toBe(server);
  });
});

describe('mergeRealtimeMessage', () => {
  it('appends a newer row without re-sorting', () => {
    const previous = timeline([message({ id: 'a', timestamp: at(1) })]);
    const next = mergeRealtimeMessage(previous, message({ id: 'b', timestamp: at(2) }));
    expect(next.messages.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('restores order when a row arrives late', () => {
    const previous = timeline([
      message({ id: 'a', timestamp: at(1) }),
      message({ id: 'c', timestamp: at(3) }),
    ]);
    const next = mergeRealtimeMessage(previous, message({ id: 'b', timestamp: at(2) }));
    expect(next.messages.map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('updates in place when the same id arrives again', () => {
    const previous = timeline([message({ id: 'a', content: 'first' })]);
    const next = mergeRealtimeMessage(previous, message({ id: 'a', content: 'edited' }));
    expect(next.messages).toHaveLength(1);
    expect(next.messages[0].content).toBe('edited');
  });

  it('replaces the optimistic row when our own send echoes back', () => {
    const previous = timeline([
      message({ id: 'optimistic-1', content: 'hi there', from_me: true, timestamp: at(4) }),
    ]);
    const next = mergeRealtimeMessage(
      previous,
      message({ id: 'server-4', content: 'hi there', from_me: true, timestamp: at(4) }),
    );
    expect(next.messages.map((m) => m.id)).toEqual(['server-4']);
  });

  it('trims to the newest TIMELINE_WINDOW rows', () => {
    const previous = timeline(
      Array.from({ length: TIMELINE_WINDOW }, (_, index) =>
        message({ id: `m${index}`, timestamp: new Date(index * 1000).toISOString() }),
      ),
    );
    const next = mergeRealtimeMessage(
      previous,
      message({ id: 'newest', timestamp: new Date(TIMELINE_WINDOW * 1000).toISOString() }),
    );
    expect(next.messages).toHaveLength(TIMELINE_WINDOW);
    expect(next.messages[0].id).toBe('m1');
    expect(next.messages[next.messages.length - 1].id).toBe('newest');
  });

  it('preserves the reactions reference so message-only updates do not invalidate them', () => {
    const previous = timeline([message({ id: 'a' })], { a: [reaction({ id: 'r1', message_id: 'a' })] });
    const next = mergeRealtimeMessage(previous, message({ id: 'b', timestamp: at(2) }));
    expect(next.reactions).toBe(previous.reactions);
  });

  it('starts from an empty timeline without complaint', () => {
    const next = mergeRealtimeMessage(EMPTY_TIMELINE, message({ id: 'a' }));
    expect(next.messages.map((m) => m.id)).toEqual(['a']);
  });
});
