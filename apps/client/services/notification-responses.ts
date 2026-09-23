import type * as Notifications from 'expo-notifications';
import { platformsApi } from './platforms';
import { snoozeLoop, updateLoop } from './loops';
import { queryClient } from './query-client';
import { notificationActions, syncNotificationBadge } from './notifications';

export interface ClaireNotificationData {
  type?: unknown;
  url?: unknown;
  loopId?: unknown;
  chatId?: unknown;
  messageId?: unknown;
  contactName?: unknown;
  chatName?: unknown;
  platform?: unknown;
  isGroup?: unknown;
}

export interface NotificationResponseOpeners {
  openChat: (data: ClaireNotificationData, draft?: string) => void;
  openLoop: (loopId: string) => void;
  openLoops?: () => void;
  openOperations: (url: string) => void;
}

const handledResponses = new Set<string>();

/** Cold-start and live listeners can surface the same response; claim it once. */
export function claimNotificationResponse(response: Notifications.NotificationResponse): boolean {
  const key = [
    response.notification.request.identifier,
    response.actionIdentifier,
    response.userText || '',
  ].join('|');
  if (handledResponses.has(key)) return false;
  handledResponses.add(key);
  if (handledResponses.size > 100) handledResponses.delete(handledResponses.values().next().value!);
  return true;
}

/**
 * Execute the system action before navigating. Reply text becomes a draft;
 * Claire never sends a message directly from the lock screen.
 */
export async function handleNotificationResponse(
  response: Notifications.NotificationResponse,
  openers: NotificationResponseOpeners
): Promise<void> {
  if (!claimNotificationResponse(response)) return;
  const data = (response.notification.request.content.data || {}) as ClaireNotificationData;
  const action = response.actionIdentifier;

  if (data.type === 'operations_incident') {
    openers.openOperations(
      typeof data.url === 'string' && data.url.startsWith('https://')
        ? data.url
        : 'https://useclaire.co/ops'
    );
    return;
  }

  if (data.type === 'loop_digest') {
    openers.openLoops?.();
    return;
  }

  if ((data.type === 'loop_reminder' || data.type === 'loop_created') && typeof data.loopId === 'string') {
    try {
      if (action === notificationActions.completeLoop) {
        await updateLoop(data.loopId, { status: 'done' });
        await queryClient.invalidateQueries({ queryKey: ['mobile-loops'] });
        await queryClient.invalidateQueries({ queryKey: ['loop-attention'] });
        await queryClient.invalidateQueries({ queryKey: ['mobile-home-loops'] });
        await queryClient.invalidateQueries({ queryKey: ['loop-detail', data.loopId] });
        return;
      }
      if (action === notificationActions.snoozeLoop) {
        await snoozeLoop(data.loopId, new Date(Date.now() + 60 * 60_000).toISOString());
        await queryClient.invalidateQueries({ queryKey: ['mobile-loops'] });
        await queryClient.invalidateQueries({ queryKey: ['loop-attention'] });
        await queryClient.invalidateQueries({ queryKey: ['mobile-home-loops'] });
        await queryClient.invalidateQueries({ queryKey: ['loop-detail', data.loopId] });
        return;
      }
    } catch (error) {
      console.warn('Could not apply the loop notification action:', error);
    }
    openers.openLoop(data.loopId);
    return;
  }

  if (typeof data.chatId !== 'string') return;
  if (action === notificationActions.markRead) {
    try {
      await platformsApi.markChatRead(data.chatId);
      await queryClient.invalidateQueries({ queryKey: ['messages-feed'] });
      await syncNotificationBadge();
      return;
    } catch (error) {
      console.warn('Could not mark the notification conversation as read:', error);
    }
  }

  const draft =
    action === notificationActions.reply && typeof response.userText === 'string'
      ? response.userText.trim()
      : undefined;
  openers.openChat(data, draft || undefined);
}
