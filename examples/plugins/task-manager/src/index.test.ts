import { describe, expect, test } from 'bun:test';
import { runPluginAction } from '@claire/plugin-sdk/test-utils';
import { taskManagerPlugin } from './index';

describe('example task manager plugin', () => {
  test('creates a mock task from a local fixture', async () => {
    const result = await runPluginAction(taskManagerPlugin, 'tasks.create', {
      conversationId: 'chat_fixture',
      sourceMessageIds: ['msg_2'],
      input: { title: 'Review launch copy with Alex', dueAt: '2026-08-19T17:00:00Z' },
    });

    expect(result.ok).toBe(true);
    expect(result.output?.taskId).toBe('task_Review launch copy with Alex');
  });
});
