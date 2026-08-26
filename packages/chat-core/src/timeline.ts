import { isLocalSend, keepPendingSends, mergeChatMessage } from './messages';
import { upsertReactionRow, type ReactionsByMessage } from './reactions';
import type { ChatMessage } from './types';

/**
 * A conversation's rendered state: the transcript plus the reactions decorating
 * it. They are one value because they are one cache entry — a screen that
 * painted messages first and reactions a round trip later charged every chat
 * open an extra serial request before it could show anything.
 */
export interface ChatTimeline {
  messages: ChatMessage[];
  reactions: ReactionsByMessage;
}

export const EMPTY_TIMELINE: ChatTimeline = { messages: [], reactions: {} };

/**
 * Newest-N window a timeline is trimmed to. Matches the mobile cache's per-chat
 * SQLite retention so the two never disagree about what "the recent history"
 * means.
 */
export const TIMELINE_WINDOW = 200;

function newestTimestamp(messages: ChatMessage[]): string | undefined {
  let newest: string | undefined;
  for (const message of messages) {
    if (!newest || message.timestamp > newest) newest = message.timestamp;
  }
  return newest;
}

/**
 * Carry optimistic reactions across a server refresh.
 *
 * Start from the server's truth and add back only what it has not accounted for.
 * The `settled` check is the load-bearing part: re-adding every local row would
 * let `upsertReactionRow` match the confirmed row on (from_me, emoji) and spread
 * the optimistic one over it, downgrading a real id back to
 * `optimistic-reaction-…` — and the row would then never be reconciled, because
 * nothing else ever looks at it again.
 */
export function keepPendingReactions(
  server: ReactionsByMessage,
  current: ReactionsByMessage,
): ReactionsByMessage {
  let next = server;
  for (const [messageId, rows] of Object.entries(current)) {
    for (const row of rows) {
      if (!isLocalSend(row.id)) continue;
      const settled = (next[messageId] || []).some(
        (candidate) =>
          candidate.id === row.id ||
          (candidate.from_me && row.from_me && candidate.emoji === row.emoji),
      );
      if (!settled) next = upsertReactionRow(next, row);
    }
  }
  return next;
}

/**
 * Fold a freshly fetched page into whatever the cache already holds.
 *
 * Two things have to survive the swap, and neither is in the server's response:
 *
 * 1. Sends still in flight, which `keepPendingSends` carries over.
 * 2. Rows that arrived by realtime *after* the request was issued. A fetch
 *    snapshots the table at T0, an INSERT lands at T1, and the T0 response
 *    arrives at T2 without it — so replacing wholesale would make a message the
 *    user already saw disappear. Anything newer than the page's newest row is
 *    therefore rescued. Only non-local rows qualify: those came from the server,
 *    so keeping them can never invent history.
 */
export function mergeServerTimeline(
  previous: ChatTimeline | undefined,
  incoming: ChatTimeline,
): ChatTimeline {
  if (!previous) return incoming;

  const newest = newestTimestamp(incoming.messages);
  const rescued = newest
    ? previous.messages.filter(
        (message) =>
          !isLocalSend(message.id) &&
          message.timestamp > newest &&
          !incoming.messages.some((row) => row.id === message.id),
      )
    : [];

  const serverMessages = rescued.length
    ? [...incoming.messages, ...rescued].sort(
        (left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp),
      )
    : incoming.messages;

  return {
    messages: keepPendingSends(serverMessages, previous.messages),
    reactions: keepPendingReactions(incoming.reactions, previous.reactions),
  };
}

/**
 * Fold one realtime row into a timeline.
 *
 * `mergeChatMessage` handles identity and optimistic replacement; this adds the
 * two things a cache needs that a render-local list did not. Re-sorting only
 * when the row is older than the tail keeps the common case (a new message,
 * appended) free and avoids reshuffling rows that share a timestamp. Trimming
 * matters because this now runs for conversations nobody is looking at: without
 * a bound, a busy group chat left warm in the cache would grow forever.
 */
export function mergeRealtimeMessage(
  previous: ChatTimeline,
  incoming: ChatMessage,
): ChatTimeline {
  const merged = mergeChatMessage(previous.messages, incoming);
  if (merged === previous.messages) return previous;

  const tail = previous.messages[previous.messages.length - 1];
  const needsSort = !!tail && incoming.timestamp < tail.timestamp;
  const ordered = needsSort
    ? [...merged].sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp))
    : merged;

  const trimmed =
    ordered.length > TIMELINE_WINDOW ? ordered.slice(ordered.length - TIMELINE_WINDOW) : ordered;

  return { messages: trimmed, reactions: previous.reactions };
}
