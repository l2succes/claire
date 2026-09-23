import type { InAppNotification } from '../../hooks/useInAppNotifications';
import { groupNotifications } from './notification-groups';

function item(id: string, chatId: string, at: string, readAt: string | null = null): InAppNotification {
  return {
    id, kind: 'message', chat_id: chatId, message_id: id, loop_id: null,
    title: 'Jare', body: id, sender_name: 'Jare', chat_name: 'Melaninaires',
    avatar_url: null, platform: 'whatsapp', is_group: true, created_at: at, read_at: readAt,
  };
}

describe('notification groups', () => {
  it('groups one chat burst without losing any read targets', () => {
    const grouped = groupNotifications([
      item('new', 'chat-1', '2026-09-22T20:05:00Z', '2026-09-22T20:06:00Z'),
      item('old', 'chat-1', '2026-09-22T20:00:00Z'),
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].ids).toEqual(['new', 'old']);
    expect(grouped[0].unread).toBe(true);
  });

  it('separates other chats and older bursts', () => {
    const grouped = groupNotifications([
      item('new', 'chat-1', '2026-09-22T20:25:00Z'),
      item('other', 'chat-2', '2026-09-22T20:23:00Z'),
      item('old', 'chat-1', '2026-09-22T20:00:00Z'),
    ]);
    expect(grouped).toHaveLength(3);
  });
});
