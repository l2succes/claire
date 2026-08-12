import { describe, expect, it, mock } from 'bun:test';

mock.module('../../utils/logger', () => ({
  logger: { debug: () => {} },
}));

const { BridgeHttpClient } = await import('./bridge-http-client');

describe('BridgeHttpClient display_and_wait login step', () => {
  it('long-polls the returned step with the login transaction id', async () => {
    const originalFetch = globalThis.fetch;
    let request: Request | undefined;

    globalThis.fetch = async (input, init) => {
      request = new Request(input, init);
      return new Response(JSON.stringify({
        login_id: 'login-1',
        type: 'complete',
        step_id: 'complete',
        complete: { user_login_id: 'whatsapp-user' },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    };

    try {
      const client = new BridgeHttpClient(
        'https://bridge.example',
        'shared-secret',
        '@claire:claire.local'
      );

      const result = await client.waitForDisplayAndWait(
        'login-1',
        'fi.mau.whatsapp.login.code',
        'txn-1'
      );

      expect(result.type).toBe('complete');
      expect(request?.method).toBe('POST');
      expect(request?.headers.get('authorization')).toBe('Bearer shared-secret');
      expect(new URL(request!.url).pathname).toBe(
        '/_matrix/provision/v3/login/step/login-1/fi.mau.whatsapp.login.code/display_and_wait'
      );
      expect(new URL(request!.url).searchParams.get('user_id')).toBe('@claire:claire.local');
      expect(new URL(request!.url).searchParams.get('txn_id')).toBe('txn-1');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('BridgeHttpClient identifier resolution', () => {
  it('resolves through the exact authenticated login without creating a DM', async () => {
    const originalFetch = globalThis.fetch;
    let request: Request | undefined;

    globalThis.fetch = async (input, init) => {
      request = new Request(input, init);
      return new Response(JSON.stringify({
        id: '15166100494',
        mxid: '@whatsapp_15166100494:claire.local',
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    };

    try {
      const client = new BridgeHttpClient(
        'https://bridge.example',
        'shared-secret',
        '@claire:claire.local'
      );

      const result = await client.resolveIdentifier('+15166100494', '15166100494');

      expect(result.mxid).toBe('@whatsapp_15166100494:claire.local');
      expect(request?.method).toBe('GET');
      expect(new URL(request!.url).pathname).toBe(
        '/_matrix/provision/v3/resolve_identifier/%2B15166100494'
      );
      expect(new URL(request!.url).searchParams.get('login_id')).toBe('15166100494');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
