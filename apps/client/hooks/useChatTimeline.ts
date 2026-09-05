import { queryOptions, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useLocalSeed } from './useLocalFirstQuery';
import {
  EMPTY_TIMELINE,
  groupReactionsByMessage,
  mergeRealtimeMessage,
  mergeServerTimeline,
  type ChatMessage,
  type ChatTimeline,
  type ReactionRow,
} from '@claire/chat-core';
import { supabase, type DbRow } from '../services/supabase';
import { cacheTimeline, cachedTimeline, usesNativeMobileCache } from '../services/mobile-cache';

/**
 * The conversation timeline, held in the query cache rather than in the chat
 * screen's state.
 *
 * That relocation is the whole feature. While the transcript lived in a
 * `useState` it was discarded on unmount, so every navigation into a chat paid a
 * skeleton plus a round trip, and a conversation that received messages while it
 * was closed could only learn about them *after* the user had already arrived.
 * A cache entry survives the screen, is readable on the first render, and can be
 * written to by the app-wide realtime channel for chats nobody is looking at.
 */

/** Columns the transcript renders. Deliberately explicit — `select('*')` here
 *  drags joined chat and contact rows onto all 100 messages. */
const TIMELINE_COLUMNS =
  'id, chat_id, content, timestamp, from_me, contact_name, contact_phone, content_type, media_url, media_mime_type, metadata, platform_message_id, reply_to_message_id, reply_to_platform_message_id';

const TIMELINE_LIMIT = 100;

/** How long a warm entry is trusted without revalidating. Deliberately under the
 *  inbox feed's 60s, so an open conversation is never staler than the list it
 *  was opened from, and a prefetch immediately followed by a tap costs nothing. */
const TIMELINE_STALE_TIME = 30_000;

/** Matches the inbox feed, so a chat and the row that opened it age out together. */
const TIMELINE_GC_TIME = 30 * 60_000;

/**
 * `highlightId` is normally undefined and must stay out of the key for ordinary
 * opens — that is what lets a second visit hit the warm entry. A Claire citation
 * can reference a message older than the 100-row window, so it fetches an extra
 * row; keying that separately keeps the shared entry free of history the next
 * refetch would drop anyway.
 */
export function chatTimelineKey(userId?: string, chatId?: string, highlightId?: string) {
  return ['chat-timeline', userId, chatId, highlightId] as const;
}

export function chatTimelinePrefix(userId?: string) {
  return ['chat-timeline', userId] as const;
}

async function fetchChatTimeline(
  userId: string,
  chatId: string,
  highlightId?: string,
): Promise<ChatTimeline> {
  const { data, error } = await supabase
    .from('messages')
    .select(TIMELINE_COLUMNS)
    .eq('chat_id', chatId)
    .eq('user_id', userId)
    .order('timestamp', { ascending: false })
    .limit(TIMELINE_LIMIT);
  if (error) throw error;

  let rows = data || [];
  // Assistant citations can reference older history than the normal chat
  // window. Fetch the cited row explicitly so it is always reachable.
  if (highlightId && !rows.some((row: DbRow) => row.id === highlightId)) {
    const { data: cited, error: citedError } = await supabase
      .from('messages')
      .select(TIMELINE_COLUMNS)
      .eq('id', highlightId)
      .eq('chat_id', chatId)
      .eq('user_id', userId)
      .maybeSingle();
    if (citedError) throw citedError;
    if (cited) rows = [...rows, cited];
  }

  const byId = new Map<string, ChatMessage>(
    rows.map((row: DbRow) => [row.id as string, row as ChatMessage]),
  );
  const messages = [...byId.values()].sort(
    (left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp),
  );

  let reactions = {};
  const messageIds = messages.map((message) => message.id).filter(Boolean);
  if (messageIds.length) {
    const { data: reactionRows, error: reactionsError } = await supabase
      .from('message_reactions')
      .select('id, message_id, emoji, from_me, reactor_id, reactor_name, reacted_at')
      .in('message_id', messageIds);
    // A client can ship slightly before the database migration. Reactions
    // should be unavailable in that state, never prevent the chat loading.
    if (reactionsError) console.warn('Failed to fetch message reactions:', reactionsError);
    else reactions = groupReactionsByMessage((reactionRows || []) as ReactionRow[]);
  }

  return { messages, reactions };
}

export function chatTimelineOptions(
  queryClient: QueryClient,
  userId: string | undefined,
  chatId: string | undefined,
  highlightId?: string,
) {
  const queryKey = chatTimelineKey(userId, chatId, highlightId);
  return queryOptions({
    queryKey,
    enabled: !!userId && !!chatId,
    staleTime: TIMELINE_STALE_TIME,
    gcTime: TIMELINE_GC_TIME,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    queryFn: async (): Promise<ChatTimeline> => {
      const server = await fetchChatTimeline(userId!, chatId!, highlightId);
      // Read the cache here rather than through structuralSharing: the merge is
      // real reconciliation (in-flight sends, rows that raced this request) and
      // belongs somewhere obvious and testable, not in a hook meant for
      // reference stability.
      const previous = queryClient.getQueryData<ChatTimeline>(queryKey);
      if (usesNativeMobileCache())
        void cacheTimeline(
          userId!,
          chatId!,
          // The select does not return chat_id for every row shape, so stamp it
          // on: cacheTimeline keys rows by conversation and silently caches
          // orphans without it.
          server.messages.map((message) => ({ ...message, chat_id: chatId! })),
        ).catch(() => undefined);
      return mergeServerTimeline(previous, server);
    },
  });
}

/**
 * The single mutating entry point. Every optimistic write, rollback and realtime
 * patch goes through here so there is exactly one writer to reason about.
 *
 * Writes to *every* cached variant of the conversation, not just the canonical
 * key. A chat opened from a Claire citation observes a highlight-specific entry,
 * and since the screen no longer runs its own per-chat message subscription,
 * addressing only the canonical key would leave that screen frozen — receiving
 * nothing until the next refetch. Same reasoning as updateInboxQueries.
 */
export function updateChatTimeline(
  queryClient: QueryClient,
  userId: string | undefined,
  chatId: string | undefined,
  updater: (previous: ChatTimeline) => ChatTimeline,
  options?: { createIfMissing?: boolean },
): void {
  if (!userId || !chatId) return;
  // Only variants that actually hold data. A query still in flight has an entry
  // but no history, and filling it in would present one message as though it
  // were the whole conversation.
  const variants = queryClient
    .getQueryCache()
    .findAll({ queryKey: ['chat-timeline', userId, chatId] })
    .filter((query) => query.state.data !== undefined);

  if (!variants.length) {
    // Without this guard the app-wide realtime handler would conjure a
    // one-message "timeline" for every conversation that ever receives
    // anything, and opening one of those would render it as the full history.
    if (!options?.createIfMissing) return;
    queryClient.setQueryData<ChatTimeline>(
      chatTimelineKey(userId, chatId),
      updater(EMPTY_TIMELINE),
    );
    return;
  }

  for (const query of variants) {
    const previous = queryClient.getQueryData<ChatTimeline>(query.queryKey) ?? EMPTY_TIMELINE;
    const next = updater(previous);
    // setQueryData notifies observers even when handed back the identical
    // reference, so an effect that writes and then depends on its own write
    // would loop forever. Bail before touching the cache instead.
    if (next === previous) continue;
    queryClient.setQueryData<ChatTimeline>(query.queryKey, next);
  }
}

/**
 * Fold a realtime `messages` row into whichever conversation it belongs to.
 *
 * Takes the raw payload rather than a typed inbox row on purpose: the inbox's
 * row type omits media and reply columns that the realtime payload does carry
 * (the table is REPLICA IDENTITY FULL), and routing through it would silently
 * strip attachments from messages arriving in a background chat.
 */
export function patchChatTimelineMessage(
  queryClient: QueryClient,
  userId: string | undefined,
  row: Record<string, unknown>,
): void {
  const chatId = typeof row.chat_id === 'string' ? row.chat_id : undefined;
  if (!chatId || typeof row.id !== 'string') return;
  updateChatTimeline(queryClient, userId, chatId, (previous) =>
    mergeRealtimeMessage(previous, row as unknown as ChatMessage),
  );
}

/** How many conversations to hold warm ahead of the user opening one. Free on
 *  native (a local read); a bounded burst of requests everywhere else. */
const WARM_LIMIT_NATIVE = 9;
const WARM_LIMIT_NETWORK = 5;

/**
 * Warm the most recent conversations so even a first-ever open has something to
 * paint. Native and Electron read their own encrypted cache, which the inbox
 * realtime handler already keeps current for every conversation; a plain browser
 * has no local cache at all, so there the only option is the network.
 */
export async function warmChatTimelines(
  queryClient: QueryClient,
  userId: string | undefined,
  chatIds: string[],
): Promise<void> {
  if (!userId) return;
  const native = usesNativeMobileCache();
  const limit = native ? WARM_LIMIT_NATIVE : WARM_LIMIT_NETWORK;
  // Sequential on purpose: warming is speculative and must never contend with
  // the inbox's own pagination on a slow connection.
  for (const chatId of chatIds.slice(0, limit)) {
    const key = chatTimelineKey(userId, chatId);
    if (queryClient.getQueryData(key)) continue;
    try {
      if (native) {
        const rows = await cachedTimeline(userId, chatId, 200);
        if (rows.length) seedChatTimeline(queryClient, userId, chatId, rows as unknown as ChatMessage[]);
      } else {
        await queryClient.prefetchQuery(chatTimelineOptions(queryClient, userId, chatId));
      }
    } catch {
      // Warming is best effort; a failure here must never surface to the user.
    }
  }
}

/**
 * Seed an entry from local data, explicitly stale.
 *
 * `updatedAt: 0` is the load-bearing argument. Without it setQueryData stamps
 * the entry as fetched *now*, it counts as fresh for the whole staleTime, and
 * refetchOnMount then silently skips the network — turning a cache warm-up into
 * a way to serve stale messages.
 */
function seedChatTimeline(
  queryClient: QueryClient,
  userId: string,
  chatId: string,
  messages: ChatMessage[],
): void {
  queryClient.setQueryData<ChatTimeline>(
    chatTimelineKey(userId, chatId),
    { messages, reactions: {} },
    { updatedAt: 0 },
  );
}

export function useChatTimeline(
  userId: string | undefined,
  chatId: string | undefined,
  highlightId?: string,
) {
  const queryClient = useQueryClient();
  const query = useQuery(chatTimelineOptions(queryClient, userId, chatId, highlightId));

  // Race the local cache against the network rather than gating the query on it.
  // Holding `enabled` false until SQLite resolves — the pattern the inbox used
  // to use — would reintroduce exactly the async hop this hook exists to remove.
  useLocalSeed<ChatTimeline>(queryClient, chatTimelineKey(userId ?? '', chatId ?? '', highlightId), {
    enabled: !!userId && !!chatId,
    read: async () => {
      if (!userId || !chatId) return null;
      const rows = await cachedTimeline(userId, chatId, 200);
      return rows.length ? { messages: rows as unknown as ChatMessage[], reactions: {} } : null;
    },
    isEmpty: (timeline) => !timeline.messages.length,
  });

  return query;
}
