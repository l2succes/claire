import { useMemo, useRef } from 'react';
import { useInfiniteQuery, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import { useLocalSeed } from './useLocalFirstQuery';
import { supabase, type DbRow } from '../services/supabase';
import { Platform } from '../types/platform';
import {
  cacheTimeline,
  hydrateMobileCache,
  patchCachedChat,
  touchCachedChatFromMessage,
  usesNativeMobileCache,
  type CachedChat,
} from '../services/mobile-cache';
import { displayContactName } from '../services/contact-display';

export interface InboxMessage {
  id: string;
  conversation_key: string;
  contact_name?: string;
  contact_avatar?: string;
  chat_name?: string;
  content: string;
  timestamp: string;
  from_me: boolean;
  is_group: boolean;
  status?: 'sent' | 'delivered' | 'read' | 'pending';
  unread_count?: number;
  has_ai_response?: boolean;
  has_open_loop?: boolean;
  chat_id: string;
  contact_phone?: string;
  platform?: Platform;
  snoozed_until?: string | null;
  is_pinned?: boolean;
  content_type?: string;
  media_url?: string;
  sender_name?: string;
}

export interface InboxCursor {
  lastActivityAt: string;
  chatId: string;
}

interface MessagePage {
  messages: InboxMessage[];
  hasMore: boolean;
  nextCursor: InboxCursor | null;
}

interface RawMessage {
  id: string;
  content: string;
  timestamp: string;
  from_me: boolean;
  is_group: boolean;
  status?: InboxMessage['status'];
  platform?: Platform;
  chat_id?: string;
  contact_phone?: string;
  contact_name?: string;
  snoozed_until?: string | null;
  chats?: { name?: string; platform_chat_id?: string; unread_count?: number; is_pinned?: boolean } | null;
  contacts?: { avatar_url?: string | null } | null;
  ai_suggestions?: Array<{ id: string; confidence?: number }>;
}

type InboxQueryData = InfiniteData<MessagePage, InboxCursor | null>;

export type InboxServerFilter = 'all' | 'unread' | 'needs_reply' | 'groups';

export function inboxQueryKey(userId?: string, search = '', filter: InboxServerFilter = 'all', platform = 'all') {
  return ['messages-feed', userId, search, filter, platform] as const;
}

/**
 * Prefix matching every search and filter variant of a user's feed. Realtime
 * patches and invalidation must use this: inboxQueryKey(userId) is only the
 * unfiltered, unsearched feed, so an exact match would leave an active search
 * or filter stale.
 */
export function inboxQueryPrefix(userId?: string) {
  return ['messages-feed', userId] as const;
}

function inboxTrace(event: string, details: Record<string, unknown> = {}) {
  // Keep useful browser/native diagnostics without logging full message bodies
  // or the complete authenticated user id.
  console.info(`[Inbox] ${event}`, details);
}

function diagnosticText(value: unknown, limit = 320) {
  if (typeof value !== 'string') return undefined;
  return value.replace(/\s+/g, ' ').slice(0, limit);
}

function inboxError(event: string, error: { code?: string; message?: string; details?: string; hint?: string }, details: Record<string, unknown> = {}) {
  // Supabase errors can retain a very large response/request graph. Passing
  // that graph to the native console makes Hermes instrument every property
  // and can itself throw "Property storage exceeds … properties". Keep error
  // reporting primitive, bounded, and useful without ever logging the object.
  const page = typeof details.page === 'number' ? details.page : undefined;
  const user = typeof details.user === 'string' ? details.user.slice(0, 8) : undefined;
  const summary = {
    ...(page !== undefined ? { page } : {}),
    ...(user ? { user } : {}),
    ...(diagnosticText(error?.code, 80) ? { code: diagnosticText(error.code, 80) } : {}),
    ...(diagnosticText(error?.message) ? { message: diagnosticText(error.message) } : {}),
    ...(diagnosticText(error?.details) ? { details: diagnosticText(error.details) } : {}),
    ...(diagnosticText(error?.hint) ? { hint: diagnosticText(error.hint) } : {}),
  };
  console.error(`[Inbox] ${event}`, JSON.stringify(summary));
}

function conversationKey(chatId: string, platform?: Platform) {
  return `${platform || Platform.WHATSAPP}:${chatId}`;
}

/**
 * A `conversation_feed` row already is a conversation, so unlike the old
 * message rows it needs no collapsing — only renaming onto the shape the
 * inbox, home screen and realtime patch helpers already consume.
 */
function conversationRowToInboxMessage(row: DbRow): InboxMessage {
  const chatId = String(row.chat_id);
  const platform = (row.platform as Platform) || Platform.WHATSAPP;
  const isGroup = row.is_group === true;
  const persistedName = (row.chat_name as string)
    || (row.contact_name as string)
    || (row.contact_inferred_name as string)
    || undefined;
  const contactPhone = (row.contact_phone as string) || undefined;
  const displayName = isGroup
    ? persistedName
    : displayContactName(persistedName, platform, contactPhone);
  return {
    id: (row.last_message_id as string) || chatId,
    conversation_key: conversationKey(chatId, platform),
    // In a group the latest sender is not the conversation's identity; keep the
    // conversation name for display and the sender separate.
    contact_name: isGroup ? (row.last_message_sender_name as string) || displayName : displayName,
    contact_avatar: (row.contact_avatar_url as string) || undefined,
    chat_name: displayName,
    content: (row.last_message_content as string) ?? '',
    timestamp: String(row.last_activity_at),
    from_me: row.last_message_from_me === true,
    is_group: isGroup,
    status: row.last_message_status as InboxMessage['status'],
    chat_id: chatId,
    contact_phone: contactPhone,
    platform,
    unread_count: typeof row.unread_count === 'number' ? row.unread_count : 0,
    has_ai_response: row.last_message_has_ai_response === true,
    snoozed_until: (row.last_message_snoozed_until as string) ?? null,
    is_pinned: row.is_pinned === true,
    content_type: (row.last_message_content_type as string) || 'text',
    media_url: (row.last_message_media_url as string) || undefined,
    sender_name: (row.last_message_sender_name as string) || undefined,
  };
}

function sameMessage(a: InboxMessage, b: InboxMessage) {
  return a.id === b.id && a.content === b.content && a.timestamp === b.timestamp &&
    a.from_me === b.from_me && a.status === b.status && a.contact_name === b.contact_name &&
    a.contact_avatar === b.contact_avatar && a.chat_name === b.chat_name &&
    a.contact_phone === b.contact_phone && a.has_ai_response === b.has_ai_response &&
    a.snoozed_until === b.snoozed_until && a.unread_count === b.unread_count && a.is_pinned === b.is_pinned;
}

function sortMessages(messages: InboxMessage[]) {
  return [...messages].sort((a, b) => Number(!!b.is_pinned) - Number(!!a.is_pinned) || new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export type InboxRealtimeRow = Partial<RawMessage> & { id: string; content?: string; timestamp?: string };

/**
 * Apply a realtime patch to every cached variant of the feed — the unfiltered
 * list plus any active search/filter combinations — instead of only the default
 * key, which would leave a filtered inbox frozen until it refetched.
 *
 * `canInsert` is true only for the unfiltered feed: a conversation that is not
 * already present must not be spliced into a filtered result set, since we
 * cannot know from the row alone whether it satisfies that filter.
 */
function updateInboxQueries(
  queryClient: QueryClient,
  userId: string | undefined,
  updater: (old: InboxQueryData | undefined, canInsert: boolean) => InboxQueryData | undefined,
) {
  const queries = queryClient.getQueryCache().findAll({ queryKey: inboxQueryPrefix(userId) });
  for (const query of queries) {
    const [, , search, filter, platform] = query.queryKey as ReturnType<typeof inboxQueryKey>;
    const canInsert = !search && filter === 'all' && platform === 'all';
    queryClient.setQueryData<InboxQueryData>(query.queryKey, (old) => updater(old, canInsert));
  }
}

export function patchInboxRealtimeMessage(
  queryClient: QueryClient,
  userId: string | undefined,
  row: InboxRealtimeRow,
) {
  if (!row.chat_id && !row.id) return;
  const platform = row.platform || Platform.WHATSAPP;
  const key = conversationKey(row.chat_id || row.id, platform);
  const incomingName = displayContactName(row.contact_name, platform, row.contact_phone);
  if (usesNativeMobileCache() && userId && row.chat_id && row.timestamp) {
    void cacheTimeline(userId, row.chat_id, [row as RawMessage & { id: string; chat_id: string; timestamp: string }]).catch(() => undefined);
    // The conversation's own row has to move too. Caching only the message left
    // cache_chats to be updated by the foreground sync alone, so a cold start
    // painted previews and unread counts from the last time the app was
    // foregrounded -- fast, and wrong.
    void touchCachedChatFromMessage(userId, row as unknown as Record<string, unknown>).catch(() => undefined);
  }
  updateInboxQueries(queryClient, userId, (old, canInsert) => {
    if (!old) return old;
    let found = false;
    const pages = old.pages.map((page) => {
      const messages = page.messages.map((message) => {
        if (message.conversation_key !== key) return message;
        found = true;
        const next = { ...message,
          id: row.id || message.id,
          content: row.content ?? message.content,
          timestamp: row.timestamp ?? message.timestamp,
          from_me: row.from_me ?? message.from_me,
          is_group: row.is_group ?? message.is_group,
          status: row.status ?? message.status,
          contact_name: row.contact_name ? incomingName : message.contact_name,
          contact_phone: row.contact_phone || message.contact_phone,
          unread_count: row.from_me === false
            ? (message.unread_count || 0) + 1
            : message.unread_count,
          platform,
        };
        return sameMessage(message, next) ? message : next;
      });
      return messages === page.messages ? page : { ...page, messages: sortMessages(messages) };
    });
    if (found) return { ...old, pages };
    // Unknown conversation: only the unfiltered feed can safely gain a row.
    if (!canInsert) return old;
    const newMessage: InboxMessage = {
      id: row.id,
      conversation_key: key,
      contact_name: incomingName,
      chat_name: incomingName,
      content: row.content ?? '',
      timestamp: row.timestamp ?? new Date().toISOString(),
      from_me: row.from_me ?? false,
      is_group: row.is_group ?? false,
      status: row.status,
      chat_id: row.chat_id || row.id,
      contact_phone: row.contact_phone,
      platform,
      unread_count: 0,
      has_ai_response: false,
      snoozed_until: row.snoozed_until ?? null,
      is_pinned: false,
    };
    const first = old.pages[0];
    if (!first) return { ...old, pages: [{ messages: [newMessage], hasMore: false, nextCursor: null }] };
    return { ...old, pages: [{ ...first, messages: sortMessages([newMessage, ...first.messages]) }, ...old.pages.slice(1)] };
  });
}

export function patchInboxChat(
  queryClient: QueryClient,
  userId: string | undefined,
  chat: Record<string, unknown> & { id: string; platform?: Platform; unread_count?: number; is_pinned?: boolean },
) {
  const key = conversationKey(chat.id, chat.platform || Platform.WHATSAPP);
  if (usesNativeMobileCache() && userId) {
    // Merged, not replaced: this row is the `chats` table alone, with no
    // contact join and no latest_message, and the cold-start paint is built
    // from exactly those two fields.
    const { latest_message: _latest, contact: _contact, ...rest } = chat;
    void patchCachedChat(userId, chat.id, rest).catch(() => undefined);
  }
  updateInboxQueries(queryClient, userId, (old) => {
    if (!old) return old;
    let changed = false;
    const pages = old.pages.map((page) => ({
      ...page,
      messages: page.messages.map((message) => {
        if (message.conversation_key !== key || (message.unread_count === chat.unread_count && message.is_pinned === chat.is_pinned)) return message;
        changed = true;
        return { ...message, unread_count: chat.unread_count ?? message.unread_count ?? 0, is_pinned: chat.is_pinned ?? message.is_pinned };
      }),
    }));
    return changed ? { ...old, pages } : old;
  });
}

export function markInboxAiResponse(queryClient: QueryClient, userId: string | undefined, messageId: string) {
  updateInboxQueries(queryClient, userId, (old) => {
    if (!old) return old;
    let changed = false;
    const pages = old.pages.map((page) => {
      const messages = page.messages.map((message) => {
        if (message.id !== messageId || message.has_ai_response) return message;
        changed = true;
        return { ...message, has_ai_response: true };
      });
      return changed ? { ...page, messages } : page;
    });
    return changed ? { ...old, pages } : old;
  });
}

function cachedInboxMessages(chats: CachedChat[]): InboxMessage[] {
  return sortMessages(chats.flatMap((chat) => {
    const latest = chat.latest_message as Record<string, unknown> | null | undefined;
    if (!latest || typeof latest.id !== 'string') return [];
    const contact = chat.contact as Record<string, unknown> | null | undefined;
    const persistedName = typeof chat.name === 'string' ? chat.name : typeof contact?.name === 'string' ? contact.name : undefined;
    const name = chat.is_group === true
      ? persistedName
      : displayContactName(persistedName, chat.platform as Platform | undefined);
    return [{
      id: latest.id,
      conversation_key: conversationKey(chat.id, chat.platform as Platform | undefined),
      contact_name: chat.is_group ? undefined : name,
      contact_avatar: typeof contact?.avatar_url === 'string' ? contact.avatar_url : undefined,
      chat_name: name,
      content: typeof latest.content === 'string' ? latest.content : '',
      timestamp: typeof latest.timestamp === 'string' ? latest.timestamp : String(chat.last_message_at || new Date(0).toISOString()),
      from_me: latest.from_me === true,
      is_group: chat.is_group === true,
      chat_id: chat.id,
      platform: (chat.platform as Platform | undefined) || Platform.WHATSAPP,
      unread_count: typeof chat.unread_count === 'number' ? chat.unread_count : 0,
      has_ai_response: false,
      snoozed_until: null,
      is_pinned: chat.is_pinned === true,
    }];
  }));
}

export function useInboxMessages(
  userId?: string,
  options: { search?: string; filter?: InboxServerFilter; platform?: Platform | 'all' } = {},
) {
  const search = options.search?.trim() ?? '';
  const filter = options.filter ?? 'all';
  const platformFilter = options.platform ?? 'all';
  const queryClient = useQueryClient();
  // Search and filters are part of the identity of this feed: they are applied
  // in the database, so each combination is a different result set and must not
  // share a cache entry.
  const queryKey = useMemo(
    () => inboxQueryKey(userId, search, filter, platformFilter),
    [userId, search, filter, platformFilter],
  );
  // Only the unfiltered feed may be seeded. A cached snapshot is the whole
  // conversation list; painting it into the Unread tab would show every
  // conversation as unread until the server disagreed.
  const canSeed = !search && filter === 'all' && platformFilter === 'all';
  const seedRef = useRef<InboxMessage[]>([]);

  const { localSettled } = useLocalSeed<InboxQueryData>(queryClient, queryKey, {
    enabled: !!userId && canSeed,
    read: async () => {
      if (!userId) return null;
      const snapshot = await hydrateMobileCache(userId);
      const messages = cachedInboxMessages(snapshot.chats);
      if (!messages.length) return null;
      seedRef.current = messages;
      // hasMore stays true so the list keeps its "load more" affordance while
      // the real first page and its cursor are on the way.
      return { pages: [{ messages, hasMore: true, nextCursor: null }], pageParams: [null] };
    },
    isEmpty: (data) => !data.pages.some((page) => page.messages.length),
  });

  const query = useInfiniteQuery<MessagePage, Error, InboxQueryData, typeof queryKey, InboxCursor | null>({
    queryKey,
    // Never gated on the cache. Holding this false until SQLite resolved put
    // the disk read on the critical path in front of the network rather than
    // beside it, and re-ran on every keystroke because the key is part of it.
    enabled: !!userId,
    initialPageParam: null,
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    queryFn: async ({ pageParam }) => {
      if (!userId) return { messages: [], hasMore: false, nextCursor: null };
      const pageSize = 20;
      const now = new Date().toISOString();
      const userTraceId = userId.slice(0, 8);
      inboxTrace('fetch:start', { pageSize, user: userTraceId, cursor: !!pageParam, search: !!search, filter, platform: platformFilter });

      // One row per conversation. Paginating `messages` and collapsing them
      // here yielded only a handful of conversations per page, so an old but
      // quiet conversation sat hundreds of pages down and was unreachable.
      let feed = supabase
        .from('conversation_feed')
        .select('*')
        .eq('user_id', userId)
        .eq('is_archived', false)
        // WhatsApp's status broadcast is a pseudo-chat, not a conversation.
        // Older rows carry no platform_chat_id, so match the name too.
        .not('platform_chat_id', 'eq', 'status@broadcast')
        .not('chat_name', 'eq', 'WhatsApp Status Broadcast')
        .or(`last_message_snoozed_until.is.null,last_message_snoozed_until.lte.${now}`)
        .order('last_activity_at', { ascending: false })
        .order('chat_id', { ascending: false })
        .limit(pageSize + 1);

      // Filters run in the database for the same reason search does: applying
      // them to the loaded pages only would filter the ~20 conversations in
      // memory rather than every conversation the account has.
      if (platformFilter !== 'all') feed = feed.eq('platform', platformFilter);
      if (filter === 'unread') feed = feed.gt('unread_count', 0);
      if (filter === 'groups') feed = feed.eq('is_group', true);
      if (filter === 'needs_reply') feed = feed.eq('last_message_from_me', false);

      // Keyset, not offset: a new message reorders the feed between pages, so
      // offsets would make the list repeat and skip conversations.
      if (pageParam) {
        feed = feed.or(
          `last_activity_at.lt.${pageParam.lastActivityAt},` +
          `and(last_activity_at.eq.${pageParam.lastActivityAt},chat_id.lt.${pageParam.chatId})`,
        );
      }
      if (search) {
        // Search the whole feed in the database. Filtering the loaded pages in
        // memory only ever searched the conversations already on screen.
        const pattern = `%${search.replace(/[,()]/g, ' ')}%`;
        feed = feed.or(
          `chat_name.ilike.${pattern},` +
          `contact_name.ilike.${pattern},` +
          `contact_inferred_name.ilike.${pattern},` +
          `contact_phone.ilike.${pattern},` +
          `last_message_content.ilike.${pattern}`,
        );
      }

      const { data, error } = await feed;
      if (error) {
        inboxError('fetch:conversations-failed', error, { user: userTraceId });
        throw error;
      }

      const rows = (data ?? []) as DbRow[];
      const hasMore = rows.length > pageSize;
      const page = hasMore ? rows.slice(0, pageSize) : rows;
      const messages = page.map(conversationRowToInboxMessage);
      const last = page[page.length - 1];
      inboxTrace('fetch:success', { conversations: messages.length, hasMore });
      return {
        messages,
        hasMore,
        nextCursor: hasMore && last
          ? { lastActivityAt: String(last.last_activity_at), chatId: String(last.chat_id) }
          : null,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const pages = query.data?.pages;
  const hasNextPage = !!query.hasNextPage;
  const messages = useMemo(() => {
    const merged = new Map<string, InboxMessage>();
    for (const page of pages ?? []) {
      for (const message of page.messages) {
        const existing = merged.get(message.conversation_key);
        if (!existing || new Date(message.timestamp) > new Date(existing.timestamp)) merged.set(message.conversation_key, message);
      }
    }
    // The server's first page is twenty conversations; the cache usually held
    // far more. Without this the list visibly shrinks the moment the network
    // answers, so the cached remainder stays on screen as a provisional tail
    // until pagination has actually caught up with it.
    if (hasNextPage && seedRef.current.length) {
      for (const message of seedRef.current) {
        if (!merged.has(message.conversation_key)) merged.set(message.conversation_key, message);
      }
    }
    return sortMessages([...merged.values()]);
  }, [pages, hasNextPage]);

  return {
    ...query,
    messages,
    loading: query.isLoading,
    loadingMore: query.isFetchingNextPage,
    hasMore: !!query.hasNextPage,
    fetchMessages: query.refetch,
    fetchNextMessages: query.fetchNextPage,
    // The only condition a full-screen skeleton may use: the cache came back
    // empty *and* the network has not answered.
    isCold: localSettled && query.isPending,
    localSettled,
  };
}
