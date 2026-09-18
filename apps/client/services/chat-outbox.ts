import { create } from 'zustand';
import * as Crypto from 'expo-crypto';
import { chatMessageFromSend, mergeChatMessage, upsertReactionRow, removeReactionRow, type ChatMessage, type ReactionRow, type ChatTimeline } from '@claire/chat-core';
import { OutgoingQueue } from './outgoing-queue';
import { readQuerySnapshot, writeQuerySnapshot } from './mobile-cache';
import { platformsApi } from './platforms';
import { PlatformRequestError } from './api-errors';
import { requestConnectionRecovery } from './connection-recovery-signal';
import { queryClient } from './query-client';
import { supabase } from './supabase';
import { useAuthStore } from '../stores/authStore';
import { usePlatformStore } from '../stores/platformStore';
import { updateChatTimeline, chatTimelineKey } from '../hooks/useChatTimeline';
import { patchInboxRealtimeMessage, inboxQueryPrefix } from '../hooks/useInboxMessages';
import type { Platform } from '../types/platform';

export type OutboxEvent = {
  id: string;
  userId: string;
  chatId: string;
  platform: Platform;
  platformChatId?: string;
  kind: 'text' | 'reaction';
  message: ChatMessage;
  target?: ChatMessage;
  emoji?: string;
  error?: string;
};
export const useChatOutbox = create<{ entries: OutboxEvent[]; attentionPlatforms: Platform[] }>(() => ({ entries: [], attentionPlatforms: [] }));
const queues = new Map<string, OutgoingQueue<OutboxEvent>>();
export function resetChatOutbox() { queues.clear(); useChatOutbox.setState({ entries: [], attentionPlatforms: [] }); }
const waiting = () => new PlatformRequestError('Waiting for connection');

function patch(event: OutboxEvent, update: (timeline: ChatTimeline) => ChatTimeline) {
  updateChatTimeline(queryClient, event.userId, event.chatId, update, { createIfMissing: true });
}
function optimisticReaction(event: OutboxEvent): ReactionRow {
  return { id: event.id, message_id: event.target!.id, emoji: event.emoji!, from_me: true,
    reactor_id: 'self', reacted_at: event.message.timestamp };
}
export function showOutboxEvent(event: OutboxEvent) {
  if (event.kind === 'reaction') {
    patch(event, (previous) => ({ ...previous, reactions: upsertReactionRow(previous.reactions, optimisticReaction(event)) }));
  } else {
    patch(event, (previous) => ({ ...previous, messages: mergeChatMessage(previous.messages, event.message) }));
    patchInboxRealtimeMessage(queryClient, event.userId, {
      ...event.message, chat_id: event.chatId, platform: event.platform,
    }, { persist: false });
  }
}
async function resolveTarget(event: OutboxEvent): Promise<string | undefined> {
  if (!event.target) return undefined;
  if (event.target.platform_message_id) return event.target.platform_message_id;
  const timeline = queryClient.getQueryData<ChatTimeline>(chatTimelineKey(event.userId, event.chatId));
  const cached = timeline?.messages.find((message) => message.id === event.target!.id);
  if (cached?.platform_message_id) return cached.platform_message_id;
  // Never guess by message text: two identical messages are distinct targets.
  const { data, error } = await supabase.from('messages').select('platform_message_id')
    .eq('user_id', event.userId).eq('chat_id', event.chatId).eq('id', event.target.id).maybeSingle();
  if (error || !data?.platform_message_id) throw waiting();
  return data.platform_message_id;
}
async function execute(event: OutboxEvent) {
  const session = usePlatformStore.getState().connectedSessions.find((candidate) =>
    candidate.platform === event.platform && candidate.status === 'connected');
  if (!session) throw waiting();
  let platformChatId = event.platformChatId;
  if (!platformChatId) {
    const { data, error } = await supabase.from('chats').select('platform_chat_id')
      .eq('user_id', event.userId).eq('id', event.chatId).maybeSingle();
    if (error || !data?.platform_chat_id) throw waiting();
    platformChatId = data.platform_chat_id as string;
  }
  const targetId = await resolveTarget(event);
  if (useAuthStore.getState().user?.id !== event.userId || !useAuthStore.getState().token) throw waiting();
  if (event.kind === 'reaction') {
    const result = await platformsApi.reactToMessage(event.platform, session.id, platformChatId,
      targetId!, event.emoji!, event.id);
    if (useAuthStore.getState().user?.id !== event.userId) return;
    patch(event, (previous) => ({ ...previous, reactions: upsertReactionRow(previous.reactions, result.reaction as ReactionRow) }));
  } else {
    const result = await platformsApi.sendMessage(event.platform, session.id, platformChatId,
      event.message.content || '', targetId, event.id);
    if (useAuthStore.getState().user?.id !== event.userId) return;
    const confirmed = chatMessageFromSend(result.message, event.message);
    // Persist resolved local targets before dropping their parent send from the queue.
    const queue = getChatOutbox(event.userId);
    for (const pending of queue.entries) {
      if (pending.target?.id === event.message.id) pending.target = confirmed;
    }
    if (useAuthStore.getState().user?.id !== event.userId) return;
    patch(event, (previous) => ({ ...previous, messages: mergeChatMessage(previous.messages, confirmed) }));
    patchInboxRealtimeMessage(queryClient, event.userId, { ...confirmed, chat_id: event.chatId, platform: event.platform });
  }
}
export function getChatOutbox(userId: string) {
  let queue = queues.get(userId);
  if (!queue) {
    queue = new OutgoingQueue<OutboxEvent>({
      read: async () => (await readQuerySnapshot<OutboxEvent[]>(userId, 'outbox-v1'))?.data || [],
      write: (entries) => writeQuerySnapshot(userId, 'outbox-v1', entries),
      execute,
      retryable: (error) => error instanceof PlatformRequestError && error.retryable,
      active: () => queues.get(userId) === queue && useAuthStore.getState().user?.id === userId && !!useAuthStore.getState().token,
      changed: () => {
        if (useAuthStore.getState().user?.id === userId && queues.get(userId) === queue) {
          useChatOutbox.setState({ entries: [...queues.get(userId)!.entries] });
        }
      },
    });
    queues.set(userId, queue);
  }
  return queue;
}
export async function enqueueChatEvent(event: Omit<OutboxEvent, 'id'>) {
  const id = event.kind === 'reaction'
    ? `optimistic-reaction-${event.target!.id}-${event.emoji}`
    : event.message.id;
  const queued = { ...event, id };
  await getChatOutbox(event.userId).enqueue(queued);
  showOutboxEvent(queued);
  requestConnectionRecovery();
}
export function newOutgoingMessage(content: string): ChatMessage {
  const id = `optimistic-${Crypto.randomUUID()}`;
  return { id, content, timestamp: new Date().toISOString(), from_me: true, metadata: { clientRequestId: id } };
}

/** Failed events can be edited/discarded without holding later sends hostage. */
export async function removeFailedChatEvent(userId: string, id: string) {
  const queue = getChatOutbox(userId);
  const event = queue.entries.find((entry) => entry.id === id && entry.error);
  if (!event) return undefined;
  for (const dependent of queue.entries) {
    if (dependent.target?.id === event.message.id) {
      dependent.error = 'The referenced message was moved back to a draft.';
    }
  }
  await queue.remove(id);
  patch(event, (previous) => event.kind === 'reaction'
    ? { ...previous, reactions: removeReactionRow(previous.reactions, { id }) }
    : { ...previous, messages: previous.messages.filter((message) => message.id !== event.message.id) });
  void queryClient.invalidateQueries({ queryKey: inboxQueryPrefix(userId) });
  requestConnectionRecovery();
  return event;
}
