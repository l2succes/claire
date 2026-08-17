import { useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import { supabase } from '../services/supabase';
import { Platform } from '../types/platform';
import { cacheTimeline, hydrateMobileCache, usesNativeMobileCache, type CachedChat } from '../services/mobile-cache';

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
  has_open_promise?: boolean;
  chat_id: string;
  contact_phone?: string;
  platform?: Platform;
  snoozed_until?: string | null;
  is_pinned?: boolean;
}

interface MessagePage {
  messages: InboxMessage[];
  hasMore: boolean;
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

type InboxQueryData = InfiniteData<MessagePage, number>;

export function inboxQueryKey(userId?: string) {
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

function isStatusBroadcast(row: RawMessage) {
  return row.chats?.platform_chat_id === 'status@broadcast' || row.chats?.name === 'WhatsApp Status Broadcast';
}

function normalizeRows(rows: RawMessage[]) {
  const byConversation = new Map<string, InboxMessage>();

  for (const row of rows) {
    if (isStatusBroadcast(row)) continue;
    const chatId = row.chat_id || row.id;
    const platform = row.platform || Platform.WHATSAPP;
    const key = conversationKey(chatId, platform);
    const current = byConversation.get(key);
    if (current && new Date(current.timestamp) >= new Date(row.timestamp)) continue;
    const conversationName = row.chats?.name || (!row.from_me ? row.contact_name : undefined);

    byConversation.set(key, {
      id: row.id,
      conversation_key: key,
      // In a DM, the chat name is the other participant. The latest message's
      // sender name may be our own profile, so never use it as the route/display
      // contact. Group rows retain the latest remote sender separately.
      contact_name: row.is_group ? row.contact_name : conversationName,
      contact_avatar: row.contacts?.avatar_url || undefined,
      chat_name: conversationName,
      content: row.content,
      timestamp: row.timestamp,
      from_me: row.from_me,
      is_group: row.is_group,
      status: row.status,
      chat_id: chatId,
      contact_phone: row.contact_phone,
      has_ai_response: (row.ai_suggestions?.length ?? 0) > 0,
      unread_count: row.chats?.unread_count ?? 0,
      platform,
      snoozed_until: row.snoozed_until ?? null,
      is_pinned: row.chats?.is_pinned ?? false,
    });
  }

  const seen = new Set<string>();
  return [...byConversation.values()]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .filter((message) => {
      const key = `${message.platform}:${message.chat_name || message.contact_phone || message.chat_id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
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

export function patchInboxRealtimeMessage(
  queryClient: QueryClient,
  userId: string | undefined,
  row: InboxRealtimeRow,
) {
  if (!row.chat_id && !row.id) return;
  const platform = row.platform || Platform.WHATSAPP;
  const key = conversationKey(row.chat_id || row.id, platform);
  if (usesNativeMobileCache() && userId && row.chat_id && row.timestamp) {
    void cacheTimeline(userId, row.chat_id, [row as RawMessage & { id: string; chat_id: string; timestamp: string }]).catch(() => undefined);
  }
  queryClient.setQueryData<InboxQueryData>(inboxQueryKey(userId), (old) => {
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
          contact_name: row.contact_name || message.contact_name,
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
    const newMessage: InboxMessage = {
      id: row.id,
      conversation_key: key,
      contact_name: row.contact_name,
      chat_name: row.contact_name,
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
    if (!first) return { ...old, pages: [{ messages: [newMessage], hasMore: false }] };
    return { ...old, pages: [{ ...first, messages: sortMessages([newMessage, ...first.messages]) }, ...old.pages.slice(1)] };
  });
}

export function patchInboxChat(
  queryClient: QueryClient,
  userId: string | undefined,
  chat: { id: string; platform?: Platform; unread_count?: number; is_pinned?: boolean },
) {
  const key = conversationKey(chat.id, chat.platform || Platform.WHATSAPP);
  queryClient.setQueryData<InboxQueryData>(inboxQueryKey(userId), (old) => {
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
  queryClient.setQueryData<InboxQueryData>(inboxQueryKey(userId), (old) => {
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
    const name = typeof chat.name === 'string' ? chat.name : typeof contact?.name === 'string' ? contact.name : undefined;
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

export function useInboxMessages(userId?: string) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => inboxQueryKey(userId), [userId]);
  const [cacheReady, setCacheReady] = useState(!usesNativeMobileCache());

  useEffect(() => {
    let active = true;
    setCacheReady(!usesNativeMobileCache());
    if (!userId || !usesNativeMobileCache()) return;
    void hydrateMobileCache(userId).then((snapshot) => {
      if (!active) return;
      const messages = cachedInboxMessages(snapshot.chats);
      if (messages.length) queryClient.setQueryData<InboxQueryData>(queryKey, { pages: [{ messages, hasMore: false }], pageParams: [0] });
    }).catch(() => undefined).finally(() => { if (active) setCacheReady(true); });
    return () => { active = false; };
  }, [queryClient, queryKey, userId]);

  const query = useInfiniteQuery<MessagePage, Error, InboxQueryData, typeof queryKey, number>({
    queryKey,
    enabled: !!userId && cacheReady,
    initialPageParam: 0,
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    queryFn: async ({ pageParam }) => {
      if (!userId) return { messages: [], hasMore: false };
      const pageSize = 20;
      const from = pageParam * pageSize;
      const now = new Date().toISOString();
      const userTraceId = userId.slice(0, 8);
      inboxTrace('fetch:start', { page: pageParam, pageSize, user: userTraceId });
      let messageResult = await supabase
        .from('messages')
        .select(`id, content, timestamp, from_me, is_group, status, platform,
          chat_id, contact_phone, contact_name, snoozed_until,
          chats!messages_chat_id_fkey (name, platform_chat_id, unread_count, is_pinned), ai_suggestions (id, confidence)`, { count: 'exact' })
        .eq('user_id', userId)
        .or(`snoozed_until.is.null,snoozed_until.lte.${now}`)
        .order('timestamp', { ascending: false })
        .range(from, from + pageSize - 1);
      // A rolling deploy can briefly leave a mobile client ahead of the
      // database migration that adds chat pinning. Do not let that optional
      // feature blank the entire inbox; retry the identical feed without it.
      if (messageResult.error?.code === '42703') {
        inboxTrace('fetch:pinning-unavailable', { page: pageParam, user: userTraceId });
        messageResult = await supabase
          .from('messages')
          .select(`id, content, timestamp, from_me, is_group, status, platform,
            chat_id, contact_phone, contact_name, snoozed_until,
            chats!messages_chat_id_fkey (name, platform_chat_id, unread_count), ai_suggestions (id, confidence)`, { count: 'exact' })
          .eq('user_id', userId)
          .or(`snoozed_until.is.null,snoozed_until.lte.${now}`)
          .order('timestamp', { ascending: false })
          .range(from, from + pageSize - 1) as typeof messageResult;
      }
      const { data, error, count } = messageResult;
      if (error) {
        inboxError('fetch:messages-failed', error, { page: pageParam, user: userTraceId });
        throw error;
      }
      const { data: contacts, error: contactsError } = await supabase
        .from('contacts')
        .select('platform, platform_contact_id, avatar_url')
        .eq('user_id', userId)
        .not('avatar_url', 'is', null);
      if (contactsError) {
        inboxError('fetch:contacts-failed', contactsError, { page: pageParam, user: userTraceId });
        throw contactsError;
      }
      const avatars = new Map(
        (contacts || []).map((contact) => [
          `${contact.platform}:${contact.platform_contact_id}`,
          contact.avatar_url,
        ]),
      );
      const rows = (data ?? []).map((row) => ({
        ...row,
        contacts: {
          avatar_url: avatars.get(`${row.platform || Platform.WHATSAPP}:${row.contact_phone || ''}`) || null,
        },
      })) as RawMessage[];
      if (usesNativeMobileCache()) {
        const byChat = new Map<string, RawMessage[]>();
        for (const row of rows) {
          const key = row.chat_id || row.id;
          byChat.set(key, [...(byChat.get(key) || []), row]);
        }
        void Promise.all([...byChat.entries()].map(([chatId, messages]) => cacheTimeline(userId, chatId, messages as Array<RawMessage & { id: string; chat_id: string; timestamp: string }>))).catch(() => undefined);
      }
      const messages = normalizeRows(rows);
      inboxTrace('fetch:success', { page: pageParam, rows: rows.length, conversations: messages.length, total: count ?? null });
      return { messages, hasMore: count ? from + pageSize < count : false };
    },
    getNextPageParam: (lastPage, allPages) => lastPage.hasMore ? allPages.length : undefined,
  });

  const messages = useMemo(() => {
    const merged = new Map<string, InboxMessage>();
    for (const page of query.data?.pages ?? []) {
      for (const message of page.messages) {
        const existing = merged.get(message.conversation_key);
        if (!existing || new Date(message.timestamp) > new Date(existing.timestamp)) merged.set(message.conversation_key, message);
      }
    }
    return sortMessages([...merged.values()]);
  }, [query.data]);

  return {
    ...query,
    messages,
    loading: query.isLoading,
    loadingMore: query.isFetchingNextPage,
    hasMore: !!query.hasNextPage,
    fetchMessages: query.refetch,
    fetchNextMessages: query.fetchNextPage,
  };
}
