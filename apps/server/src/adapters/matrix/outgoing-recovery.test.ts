import { describe, expect, it, mock } from 'bun:test';
mock.module('../../services/operations-telemetry', () => ({ operationsTelemetry: { record: async () => undefined } }));
const { MatrixBridgeAdapter } = await import('./index');
const { Platform, PlatformStatus } = await import('../types');

function setup() {
  const adapter = new MatrixBridgeAdapter({ serverName: 'test.local' } as any);
  const internals = adapter as any;
  const sendEvent = mock(async (_room: string, _type: string, _content: unknown, txn: string) => ({ event_id: `$${txn}` }));
  const retryImmediately = mock(() => true);
  const initiateAuth = mock(async () => undefined);
  internals.matrixClient = { sendEvent, retryImmediately };
  internals.sessions.set('session', { id: 'session', userId: 'test-user', status: PlatformStatus.CONNECTED });
  internals.sessionPlatforms.set('session', Platform.WHATSAPP);
  internals.bridgeAuthManager = { initiateAuth };
  return { adapter, sendEvent, retryImmediately, initiateAuth };
}
describe('Matrix outgoing recovery', () => {
  it('passes the same idempotency key to Matrix on retry and keeps client identity', async () => {
    const { adapter, sendEvent } = setup();
    const message = { content: 'synthetic test', transactionId: 'stable-key', clientRequestId: 'client-key' };
    const first = await adapter.sendMessage('session', '!test:test.local', message);
    const retry = await adapter.sendMessage('session', '!test:test.local', message);
    expect(first.platformMessageId).toBe(retry.platformMessageId);
    expect(sendEvent.mock.calls.map((call) => call[3])).toEqual(['stable-key', 'stable-key']);
    expect(retry.platformMetadata?.clientRequestId).toBe('client-key');
  });
  it('uses a stable transaction for reactions too', async () => {
    const { adapter, sendEvent } = setup();
    await adapter.sendReaction('session', '!test:test.local', '$target', '👍', 'reaction-key');
    expect(sendEvent.mock.calls[0][3]).toBe('reaction-key');
  });
  it('wakes the existing transport without initiating a login', () => {
    const { adapter, retryImmediately, initiateAuth } = setup();
    adapter.recoverTransport();
    expect(retryImmediately).toHaveBeenCalledTimes(1);
    expect(initiateAuth).not.toHaveBeenCalled();
  });
});
