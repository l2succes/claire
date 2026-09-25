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

  it('opens a newly created loop on tap, including a duplicate cold-start response', async () => {
    const target = openers();
    const event = response('created-loop-tap', 'expo.modules.notifications.actions.DEFAULT', {
      type: 'loop_created', loopId: 'new-loop', chatId: 'source-chat',
    });
    await handleNotificationResponse(event, target);
    await handleNotificationResponse(event, target);
    expect(target.openLoop).toHaveBeenCalledWith('new-loop');
    expect(target.openLoop).toHaveBeenCalledTimes(1);
    expect(target.openChat).not.toHaveBeenCalled();
    expect(updateLoop).not.toHaveBeenCalled();
  });

  it('supports completing a newly created loop from the notification', async () => {
    const target = openers();
    await handleNotificationResponse(response('created-loop-complete', 'claire_complete_loop', {
      type: 'loop_created', loopId: 'new-loop',
    }), target);
    expect(updateLoop).toHaveBeenCalledWith('new-loop', { status: 'done' });
    expect(target.openLoop).not.toHaveBeenCalled();
  });

  it('supports snoozing a newly created loop from the notification', async () => {
    const target = openers();
    await handleNotificationResponse(response('created-loop-snooze', 'claire_snooze_loop', {
      type: 'loop_created', loopId: 'new-loop',
    }), target);
    expect(snoozeLoop).toHaveBeenCalledWith('new-loop', expect.any(String));
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

it('opens the follow-up queue for a digest without applying a loop action', async () => {
  const openLoops = jest.fn();
  await handleNotificationResponse({
    actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
    notification: { request: { identifier: 'digest-recovery-test', content: { data: { type: 'loop_digest' } } } },
  } as any, { openChat: jest.fn(), openLoop: jest.fn(), openLoops, openOperations: jest.fn() });
  expect(openLoops).toHaveBeenCalledTimes(1);
});
