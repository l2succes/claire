import type { NotificationResponse } from 'expo-notifications';
import { handleNotificationResponse } from '../services/notification-responses';
import { platformsApi } from '../services/platforms';
import { snoozeLoop, updateLoop } from '../services/loops';

jest.mock('../services/platforms', () => ({
  platformsApi: { markChatRead: jest.fn(async () => undefined) },
}));
jest.mock('../services/loops', () => ({
  updateLoop: jest.fn(async () => undefined),
  snoozeLoop: jest.fn(async () => undefined),
}));
jest.mock('../services/query-client', () => ({
  queryClient: { invalidateQueries: jest.fn(async () => undefined) },
}));
jest.mock('../services/notifications', () => ({
  notificationActions: {
    reply: 'claire_reply',
    markRead: 'claire_mark_read',
    completeLoop: 'claire_complete_loop',
    snoozeLoop: 'claire_snooze_loop',
  },
  syncNotificationBadge: jest.fn(async () => undefined),
}));

function response(
  identifier: string,
  actionIdentifier: string,
  data: Record<string, unknown>,
  userText?: string
) {
  return {
    actionIdentifier,
    userText,
    notification: { request: { identifier, content: { data } } },
  } as NotificationResponse;
}

function openers() {
  return {
    openChat: jest.fn(),
    openLoop: jest.fn(),
    openOperations: jest.fn(),
  };
}

describe('notification actions', () => {
  beforeEach(() => jest.clearAllMocks());

  it('opens a typed reply as a draft without sending it', async () => {
    const target = openers();
    await handleNotificationResponse(
      response(
        'message-1',
        'claire_reply',
        {
          type: 'new_message',
          chatId: 'chat-1',
          messageId: 'message-1',
        },
        ' On my way '
      ),
      target
    );

    expect(target.openChat).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: 'chat-1' }),
      'On my way'
    );
  });

  it('marks a conversation read through the authenticated message API', async () => {
    const target = openers();
    await handleNotificationResponse(
      response('message-2', 'claire_mark_read', {
        type: 'new_message',
        chatId: 'chat-2',
      }),
      target
    );

    expect(platformsApi.markChatRead).toHaveBeenCalledWith('chat-2');
    expect(target.openChat).not.toHaveBeenCalled();
  });

  it('completes a loop without opening it', async () => {
    const target = openers();
    await handleNotificationResponse(
      response('loop-1', 'claire_complete_loop', {
        type: 'loop_reminder',
        loopId: 'loop-1',
      }),
      target
    );

    expect(updateLoop).toHaveBeenCalledWith('loop-1', { status: 'done' });
    expect(snoozeLoop).not.toHaveBeenCalled();
    expect(target.openLoop).not.toHaveBeenCalled();
  });

  it('ignores the duplicate cold-start delivery of one response', async () => {
    const target = openers();
    const event = response(
      'message-3',
      'claire_reply',
      { type: 'new_message', chatId: 'chat-3' },
      'Hello'
    );
    await handleNotificationResponse(event, target);
    await handleNotificationResponse(event, target);

    expect(target.openChat).toHaveBeenCalledTimes(1);
  });
});
