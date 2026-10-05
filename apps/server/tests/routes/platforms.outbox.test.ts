import { describe, expect, it, mock } from 'bun:test';
import express from 'express';
import request from 'supertest';
import { Platform, PlatformStatus, MessageContentType } from '../../src/adapters/types';

let activeAdapter: unknown;
mock.module('../../src/adapters', () => ({
  platformManager: { getAdapter: () => activeAdapter },
  Platform,
  PlatformStatus,
  MessageContentType,
}));
mock.module('../../src/services/supabase', () => ({
  supabase: {},
  authHelpers: { verifyToken: async () => ({ id: 'test-user' }) },
}));
mock.module('../../src/services/operations-telemetry', () => ({
  operationsTelemetry: { record: async () => undefined },
}));

const { MatrixBridgeAdapter } = await import('../../src/adapters/matrix');
const { DemoBridgeAdapter } = await import('../../src/adapters/demo');
const { default: routes } = await import('../../src/routes/platforms');

const app = express();
app.use(express.json());
app.use('/platforms', routes);

describe('POST /platforms/:platform/outbox/send', () => {
  it('accepts a queued send through a demo-decorated Matrix adapter', async () => {
    const matrix = new MatrixBridgeAdapter({ serverName: 'test.local' } as any);
    const internals = matrix as any;
    const sendEvent = mock(async (_room: string, _type: string, _content: unknown, txn: string) => ({ event_id: `$${txn}` }));
    internals.matrixClient = { sendEvent };
    internals.sessions.set('session', {
      id: 'session', userId: 'test-user', platform: Platform.WHATSAPP,
      status: PlatformStatus.CONNECTED, lastConnectedAt: new Date(),
    });
    internals.sessionPlatforms.set('session', Platform.WHATSAPP);
    activeAdapter = new DemoBridgeAdapter(matrix, {
      ingest: async () => undefined,
      isDemoUser: async () => false,
      onOutgoing: () => undefined,
    });

    const response = await request(app)
      .post('/platforms/whatsapp/outbox/send')
      .set('Authorization', 'Bearer test-token')
      .send({ sessionId: 'session', chatId: '!test:test.local', content: '#claire-test route', clientRequestId: 'outbox-key' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(sendEvent).toHaveBeenCalledTimes(1);
    expect(sendEvent.mock.calls[0][3]).toMatch(/^claire-[a-f0-9]{64}$/);
  });
});
