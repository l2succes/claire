import type { InAppNotification } from '../../hooks/useInAppNotifications';

export interface NotificationGroup {
  latest: InAppNotification;
  ids: string[];
  unread: boolean;
}

/** Collapse adjacent messages from one chat within a short conversation burst. */
export function groupNotifications(items: InAppNotification[]): NotificationGroup[] {
  const groups: NotificationGroup[] = [];
  for (const item of items) {
    const previous = groups[groups.length - 1];
    const sameBurst = previous?.latest.kind === 'message' && item.kind === 'message'
      && !!item.chat_id && item.chat_id === previous.latest.chat_id
      && Math.abs(Date.parse(previous.latest.created_at) - Date.parse(item.created_at)) <= 10 * 60_000;
    if (sameBurst) {
      previous.ids.push(item.id);
      previous.unread ||= !item.read_at;
    } else {
      groups.push({ latest: item, ids: [item.id], unread: !item.read_at });
    }
  }
  return groups;
}
