import { describe, expect, test } from 'bun:test';
import { runPluginAction } from '@claire/plugin-sdk/test-utils';
import { calendarPlugin, listFixtureEvents } from './index';

describe('example calendar plugin', () => {
  test('creates a mock event from a local fixture', async () => {
    const result = await runPluginAction(calendarPlugin, 'calendar.events.create', {
      conversationId: 'chat_fixture',
      sourceMessageIds: ['msg_1'],
      input: {
        title: 'Send Maya the proposal',
        startsAt: '2026-08-18T15:00:00Z',
        endsAt: '2026-08-18T15:30:00Z',
      },
    });

    expect(result.ok).toBe(true);
    expect(result.output?.eventId).toBe('evt_Send Maya the proposal');
    expect(listFixtureEvents()).toHaveLength(1);
  });
});
