import { describe, expect, it } from 'bun:test';
import { loopActivityRow, messageActivityRow } from './in-app-notifications';

describe('in-app notification records', () => {
  it('keeps sender and group identity separate and uses group artwork', () => {
    const row = messageActivityRow({
      userId: 'user-1', chatId: 'chat-1', messageId: 'message-1', platform: 'whatsapp',
      senderName: 'Jare', chatName: 'Melaninaires', isGroup: true, content: 'See you there',
    }, { senderAvatarUrl: 'https://example.com/jare.jpg', chatAvatarUrl: 'https://example.com/group.jpg' });
    expect(row.title).toBe('Jare');
    expect(row.chat_name).toBe('Melaninaires');
    expect(row.avatar_url).toBe('https://example.com/group.jpg');
    expect(row.event_key).toBe('message-1');
  });

  it('uses one stable key for repeated loop scheduler polls', () => {
    const row = loopActivityRow({ loopId: 'loop-1', revision: 3, userId: 'user-1', title: 'Follow up', body: 'Review the deck', reason: 'due' });
    expect(row.event_key).toBe('loop-1:3');
    expect(row.loop_id).toBe('loop-1');
  });
});
