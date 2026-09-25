import { supabase } from './supabase';
import type { IncomingNotificationEvent, LoopReminderNotificationEvent } from './notification-delivery';

export function messageActivityRow(
  event: IncomingNotificationEvent,
  artwork: { senderAvatarUrl?: string; chatAvatarUrl?: string },
) {
  const isGroup = event.isGroup === true;
  const senderName = event.senderName?.trim() || (!isGroup ? event.chatName?.trim() : undefined) || 'New message';
  const chatName = event.chatName?.trim() || (isGroup ? 'Group chat' : senderName);
  return {
    user_id: event.userId,
    kind: 'message',
    event_key: event.messageId,
    chat_id: event.chatId,
    message_id: event.messageId,
    title: senderName,
    body: event.content.trim().slice(0, 240) || 'Sent you an update',
    sender_name: senderName,
    chat_name: chatName,
    avatar_url: (isGroup ? artwork.chatAvatarUrl || artwork.senderAvatarUrl : artwork.senderAvatarUrl) || null,
    platform: event.platform,
    is_group: isGroup,
  };
}

export function loopActivityRow(event: LoopReminderNotificationEvent) {
  return {
    user_id: event.userId,
    kind: 'loop',
    event_key: `${event.loopId}:${event.revision}`,
    loop_id: event.loopId,
    title: event.title.trim() || 'Follow-up due',
    body: event.body.trim().slice(0, 240) || 'A follow-up needs your attention',
  };
}

export async function recordMessageActivity(event: IncomingNotificationEvent, artwork: { senderAvatarUrl?: string; chatAvatarUrl?: string }): Promise<void> {
  const { error } = await supabase.from('in_app_notifications').upsert(messageActivityRow(event, artwork), {
    onConflict: 'user_id,kind,event_key', ignoreDuplicates: true,
  });
  if (error) throw error;
}

export async function recordLoopActivity(event: LoopReminderNotificationEvent): Promise<void> {
  const { error } = await supabase.from('in_app_notifications').upsert(loopActivityRow(event), {
    onConflict: 'user_id,kind,event_key', ignoreDuplicates: true,
  });
  if (error) throw error;
}
