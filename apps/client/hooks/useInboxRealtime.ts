import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/supabase';
import { notifyWebMessageUpdate } from '../services/notifications';
import {
  inboxQueryPrefix,
  markInboxAiResponse,
  patchInboxChat,
  patchInboxRealtimeMessage,
  type InboxRealtimeRow,
} from './useInboxMessages';
import { patchChatTimelineMessage } from './useChatTimeline';
import { Platform } from '../types/platform';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

// Keep Operations' client signal intentionally content-free. The server HMACs
// the account ID and rejects message identifiers or arbitrary event payloads.
async function reportClientState(state: 'connected' | 'disconnected' | 'acknowledged', platform = 'mock') {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) return;
  await fetch(`${API_BASE_URL}/telemetry/client-state`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ state, platform }),
  });
}

// Exactly one live channel is guaranteed structurally, not by a mount flag:
// every effect run sweeps any predecessor via dropInboxChannels and then opens
// a topic no other subscriber can collide with. A boolean guard would instead
// turn a second subscriber away with no cleanup, and the first one's teardown
// would then leave the app with zero subscriptions until the next remount.
function dropInboxChannels(userId: string) {
  for (const existing of supabase.getChannels()) {
    if (
      existing.topic.includes(`inbox-feed:${userId}`) ||
      existing.topic.includes(`messages-feed-${userId}`)
    ) {
      void supabase.removeChannel(existing);
    }
  }
}

export function useInboxRealtime(userId?: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;
    let fallbackTimer: ReturnType<typeof setInterval> | undefined;
    const startFallback = (intervalMs: number) => {
      if (cancelled) return;
      if (fallbackTimer) clearInterval(fallbackTimer);
      fallbackTimer = setInterval(() => {
        if (!cancelled) void queryClient.invalidateQueries({ queryKey: inboxQueryPrefix(userId) });
      }, intervalMs);
    };

    startFallback(60_000);
    dropInboxChannels(userId);

    const topic = `inbox-feed:${userId}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase.channel(topic);
    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `user_id=eq.${userId}` }, ({ new: row }) => {
      const message = row as InboxRealtimeRow;
      if (message.platform) void reportClientState('acknowledged', message.platform);
      if (!message.from_me) {
        notifyWebMessageUpdate(
          message.contact_name || 'New message',
          message.content || 'Sent you an update',
          { type: 'new_message', chatId: message.chat_id, platform: message.platform },
        );
      }
      patchInboxRealtimeMessage(queryClient, userId, message);
      // This is what makes a conversation current *before* the user opens it.
      // The row is passed raw rather than as an InboxRealtimeRow because that
      // type omits the media and reply columns the payload actually carries.
      patchChatTimelineMessage(queryClient, userId, row as Record<string, unknown>);
    });
    channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `user_id=eq.${userId}` }, ({ new: row }) => {
      patchInboxRealtimeMessage(queryClient, userId, row as InboxRealtimeRow);
      patchChatTimelineMessage(queryClient, userId, row as Record<string, unknown>);
    });
    channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chats', filter: `user_id=eq.${userId}` }, ({ new: row }) => {
      const chat = row as { id: string; platform?: Platform; unread_count?: number; is_pinned?: boolean };
      patchInboxChat(queryClient, userId, chat);
    });
    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ai_suggestions', filter: `user_id=eq.${userId}` }, ({ new: row }) => {
      const messageId = (row as { message_id?: string }).message_id;
      if (messageId) markInboxAiResponse(queryClient, userId, messageId);
    });
    channel.subscribe((status, error) => {
      if (cancelled) return;
      console.info('[Inbox] realtime:status', { status, hasError: !!error });
      if (status === 'SUBSCRIBED') {
        void reportClientState('connected');
        startFallback(60_000);
        return;
      }
      if (status === 'CLOSED') return;
      console.warn('[Inbox] realtime subscription unavailable:', status, error ?? '');
      startFallback(15_000);
    });

    return () => {
      cancelled = true;
      if (fallbackTimer) clearInterval(fallbackTimer);
      void reportClientState('disconnected');
      void supabase.removeChannel(channel);
    };
  }, [queryClient, userId]);
}
