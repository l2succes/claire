import { describe, expect, it } from 'bun:test';

import { MessageContentType, Platform, type UnifiedMessage } from '../adapters/types';
import { applyIncomingMessageEdit } from './message-edits';

function editMessage(overrides: Partial<UnifiedMessage> = {}): UnifiedMessage {
  return {
    id: 'matrix-evt-edit',
    platformMessageId: 'evt-edit',
    editOfPlatformMessageId: 'evt-original',
    platform: Platform.WHATSAPP,
    sessionId: 'session-1',
    userId: 'user-1',
    content: 'corrected text',
    contentType: MessageContentType.TEXT,
    senderId: '@whatsapp_self:claire.local',
    chatId: 'contact-1',
    chatType: 'individual',
    timestamp: new Date('2026-09-10T12:28:30.000Z'),
    isFromMe: true,
    isRead: false,
    hasMedia: false,
    formattedBody: '<strong>corrected text</strong>',
    mentions: ['@whatsapp_15551212:claire.local'],
    platformMetadata: {
      matrixRoomId: '!room:claire.local',
      matrixSenderId: '@whatsapp_self:claire.local',
    },
    ...overrides,
  };
}

describe('applyIncomingMessageEdit', () => {
  it('passes the replacement and original identities to the atomic database operation', async () => {
    let call: { name: string; args: Record<string, unknown> } | undefined;
    const client = {
      rpc: async (name: string, args: Record<string, unknown>) => {
        call = { name, args };
        return {
          data: [{
            message_id: 'db-message-1',
            message_chat_id: 'db-chat-1',
            message_contact_name: null,
            message_from_me: true,
            message_timestamp: '2026-09-10T12:28:00.000Z',
            message_platform: 'whatsapp',
            edit_applied: true,
            duplicate_removed: true,
          }],
          error: null,
        };
      },
    };

    const result = await applyIncomingMessageEdit(editMessage(), client as never);

    expect(call?.name).toBe('apply_message_edit');
    expect(call?.args).toMatchObject({
      p_target_platform_message_id: 'evt-original',
      p_edit_platform_message_id: 'evt-edit',
      p_content: 'corrected text',
      p_formatted_body: '<strong>corrected text</strong>',
      p_mentions: ['15551212'],
      p_matrix_room_id: '!room:claire.local',
      p_matrix_sender_id: '@whatsapp_self:claire.local',
    });
    expect(result).toEqual({
      messageId: 'db-message-1',
      chatId: 'db-chat-1',
      contactName: null,
      fromMe: true,
      timestamp: '2026-09-10T12:28:00.000Z',
      platform: 'whatsapp',
      applied: true,
      duplicateRemoved: true,
    });
  });

  it('does nothing for a normal message', async () => {
    let called = false;
    const client = {
      rpc: async () => {
        called = true;
        return { data: [], error: null };
      },
    };

    expect(
      await applyIncomingMessageEdit(
        editMessage({ editOfPlatformMessageId: undefined }),
        client as never
      )
    ).toBeNull();
    expect(called).toBe(false);
  });
});
