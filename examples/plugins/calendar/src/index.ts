import { createReceiptId, definePlugin } from '@claire/plugin-sdk';

const events = new Map<string, Record<string, unknown>>();

export const calendarPlugin = definePlugin({
  manifest: {
    schemaVersion: '1',
    id: 'com.claire.example.calendar',
    version: '0.1.0',
    name: 'Example Calendar',
    description: 'Creates mock calendar events from local fixtures. No external account required.',
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
        id: 'calendar.events.create',
        kind: 'action',
        title: 'Create event',
        description: 'Create a local fixture calendar event after approval.',
        inputSchema: {
          type: 'object',
          required: ['title', 'startsAt'],
          properties: {
            title: { type: 'string' },
            startsAt: { type: 'string' },
            endsAt: { type: 'string' },
          },
        },
        outputSchema: { type: 'object', properties: { eventId: { type: 'string' } } },
        risk: 'low_write',
        approval: 'always',
        reversible: true,
        idempotency: true,
      },
    ],
    triggers: [
      {
        id: 'schedule-detected',
        event: 'schedule.detected',
        supportedActions: ['calendar.events.create'],
      },
    ],
    dataHandling: {
      receivesRawMessages: false,
      retention: 'none',
    },
  },
  handlers: {
    async 'calendar.events.create'(request) {
      const eventId = `evt_${request.input.title ?? 'untitled'}`;
      events.set(eventId, request.input);
      return {
        ok: true,
        output: { eventId, stored: true, dryRun: Boolean(request.dryRun) },
        receiptId: createReceiptId('calendar'),
      };
    },
  },
});

export function listFixtureEvents() {
  return [...events.entries()].map(([id, event]) => ({ id, ...event }));
}
