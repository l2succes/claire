import { createReceiptId, definePlugin } from '@claire/plugin-sdk';

const tasks = new Map<string, Record<string, unknown>>();

export const taskManagerPlugin = definePlugin({
  manifest: {
    schemaVersion: '1',
    id: 'com.claire.example.tasks',
    version: '0.1.0',
    name: 'Example Task Manager',
    description: 'Creates mock tasks from local fixtures. No third-party account required.',
    publisher: {
      id: 'claire',
      name: 'Claire',
      verification: 'claire',
      website: 'https://github.com/l2succes/claire',
      privacyPolicyUrl: 'https://github.com/l2succes/claire/blob/main/SECURITY.md',
      supportUrl: 'https://github.com/l2succes/claire/discussions',
    },
    icon: {
      lightUrl: '/assets/brand/claire-app-icon.svg',
      sha256: '0'.repeat(64),
    },
    runtime: { kind: 'claire_adapter', minimumClaireVersion: '0.1.0' },
    auth: [{ id: 'local', type: 'none', provider: 'fixture', requestedScopes: [] }],
    capabilities: [
      {
        id: 'tasks.create',
        kind: 'action',
        title: 'Create task',
        description: 'Create a local fixture task after approval.',
        inputSchema: {
          type: 'object',
          required: ['title'],
          properties: {
            title: { type: 'string' },
            dueAt: { type: 'string' },
          },
        },
        outputSchema: { type: 'object', properties: { taskId: { type: 'string' } } },
        risk: 'low_write',
        approval: 'always',
        reversible: true,
        idempotency: true,
      },
    ],
    triggers: [
      {
        id: 'promise-detected',
        event: 'promise.detected',
        supportedActions: ['tasks.create'],
      },
    ],
    dataHandling: {
      receivesRawMessages: false,
      retention: 'none',
    },
  },
  handlers: {
    async 'tasks.create'(request) {
      const taskId = `task_${request.input.title ?? 'untitled'}`;
      tasks.set(taskId, request.input);
      return {
        ok: true,
        output: { taskId, stored: true, dryRun: Boolean(request.dryRun) },
        receiptId: createReceiptId('task'),
      };
    },
  },
});
