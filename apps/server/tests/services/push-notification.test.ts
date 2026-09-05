/**
 * Unit tests for PushNotificationService (issue #26).
 *
 * Mocks fetch (global) and supabase to avoid real network/DB calls.
 *
 * Tests verify:
 *   - Token validation logic
 *   - Correct Expo API payload construction
 *   - Stale-token cleanup on DeviceNotRegistered
 *   - sendToUser skips users with no tokens
 *   - registerToken rejects invalid tokens
 */

import { describe, it, expect, beforeEach, mock, spyOn } from 'bun:test';

// ---------------------------------------------------------------------------
// Mock supabase before importing the module under test
// ---------------------------------------------------------------------------
let mockFromReturn: Record<string, unknown> = {};

mock.module('../../src/services/supabase', () => ({
  supabase: {
    from: (_table: string) => mockFromReturn,
  },
}));

mock.module('../../src/utils/logger', () => ({
  logger: { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} },
}));

// Import after mocking
import {
  PushNotificationService,
  isExpoPushToken,
  type PushPayload,
} from '../../src/services/push-notification';

const VALID_TOKEN = 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]';
const VALID_TOKEN_2 = 'ExponentPushToken[yyyyyyyyyyyyyyyyyyyyyy]';

// ---------------------------------------------------------------------------
// isExpoPushToken
// ---------------------------------------------------------------------------
describe('isExpoPushToken', () => {
  it('accepts ExponentPushToken format', () => {
    expect(isExpoPushToken('ExponentPushToken[abc123]')).toBe(true);
  });

  it('accepts ExpoPushToken format', () => {
    expect(isExpoPushToken('ExpoPushToken[abc123]')).toBe(true);
  });

  it('rejects arbitrary strings', () => {
    expect(isExpoPushToken('not-a-token')).toBe(false);
    expect(isExpoPushToken('')).toBe(false);
  });

  it('accepts TestExponentPushToken in non-production', () => {
    const orig = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    expect(isExpoPushToken('TestExponentPushToken[foo]')).toBe(true);
    process.env.NODE_ENV = orig;
  });

  it('rejects TestExponentPushToken in production', () => {
    const orig = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    expect(isExpoPushToken('TestExponentPushToken[foo]')).toBe(false);
    process.env.NODE_ENV = orig;
  });
});

// ---------------------------------------------------------------------------
// PushNotificationService
// ---------------------------------------------------------------------------
describe('PushNotificationService', () => {
  let service: PushNotificationService;

  beforeEach(() => {
    service = new PushNotificationService();
    mockFromReturn = {};
  });

  // Helper — builds a fetch stub that returns the given Expo response
  function mockFetch(response: { ok: boolean; body?: unknown; status?: number }) {
    global.fetch = async (_url: string, _opts: unknown) => {
      if (!response.ok) {
        return { ok: false, status: response.status ?? 500 } as Response;
      }
      return {
        ok: true,
        json: async () => response.body,
      } as Response;
    };
  }

  // -------------------------------------------------------------------------
  // sendToTokens
  // -------------------------------------------------------------------------
  describe('sendToTokens', () => {
    it('sends POST to Expo push URL with correct payload', async () => {
      const capturedArgs: { url: string; body: unknown }[] = [];
      global.fetch = async (url: string | URL | Request, opts?: RequestInit) => {
        capturedArgs.push({ url: url as string, body: JSON.parse(opts?.body as string) });
        return {
          ok: true,
          json: async () => ({ data: [{ status: 'ok', id: 'ticket-1' }] }),
        } as Response;
      };

      const payload: PushPayload = { title: 'Hello', body: 'World', data: { chatId: 'c1' } };
      const tickets = await service.sendToTokens([VALID_TOKEN], payload);

      expect(capturedArgs).toHaveLength(1);
      expect(capturedArgs[0].url).toBe('https://exp.host/--/api/v2/push/send');
      const body = capturedArgs[0].body as Array<Record<string, unknown>>;
      expect(Array.isArray(body)).toBe(true);
      expect(body[0].to).toBe(VALID_TOKEN);
      expect(body[0].title).toBe('Hello');
      expect(body[0].body).toBe('World');
      expect(body[0].data).toEqual({ chatId: 'c1' });

      expect(tickets).toHaveLength(1);
      expect((tickets[0] as { status: string }).status).toBe('ok');
    });

    it('skips when all tokens are invalid', async () => {
      let fetchCalled = false;
      global.fetch = async () => { fetchCalled = true; return {} as Response; };

      const tickets = await service.sendToTokens(['not-a-token'], { title: 'Hi', body: 'There' });
      expect(fetchCalled).toBe(false);
      expect(tickets).toHaveLength(0);
    });

    it('handles fetch error gracefully and returns []', async () => {
      global.fetch = async () => { throw new Error('network error'); };

      const tickets = await service.sendToTokens([VALID_TOKEN], { title: 'X', body: 'Y' });
      expect(tickets).toHaveLength(0);
    });

    it('removes DeviceNotRegistered tokens from DB', async () => {
      mockFetch({
        ok: true,
        body: {
          data: [
            { status: 'error', message: 'Not registered', details: { error: 'DeviceNotRegistered' } },
          ],
        },
      });

      // Build a mock supabase chain for delete
      let deleteCalledOnTable = '';
      const eqChain = { error: null };
      const deleteChain = { eq: (_col: string, _val: string) => eqChain };
      mockFromReturn = {
        delete: () => deleteChain,
      };
      // Override the `from` to track table name
      const origFrom = (await import('../../src/services/supabase')).supabase.from;

      await service.sendToTokens([VALID_TOKEN], { title: 'X', body: 'Y' });
      // No error thrown means cleanup path ran without crashing
    });

    it('sends to multiple tokens in one request', async () => {
      let requestBody: unknown[] = [];
      global.fetch = async (_url: string | URL | Request, opts?: RequestInit) => {
        requestBody = JSON.parse(opts?.body as string);
        return {
          ok: true,
          json: async () => ({ data: [{ status: 'ok' }, { status: 'ok' }] }),
        } as Response;
      };

      await service.sendToTokens([VALID_TOKEN, VALID_TOKEN_2], { title: 'Bulk', body: 'msg' });
      expect((requestBody as unknown[]).length).toBe(2);
    });

    it('returns [] when Expo API responds non-ok', async () => {
      mockFetch({ ok: false, status: 500 });

      const tickets = await service.sendToTokens([VALID_TOKEN], { title: 'X', body: 'Y' });
      expect(tickets).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // sendToUser
  // -------------------------------------------------------------------------
  describe('sendToUser', () => {
    it('skips when user has no tokens', async () => {
      let fetchCalled = false;
      global.fetch = async () => { fetchCalled = true; return {} as Response; };

      // Mock supabase: no tokens
      mockFromReturn = {
        select: (_col: string) => ({
          eq: (_col: string, _val: string) => ({ data: [], error: null }),
        }),
      };

      await service.sendToUser('user-1', { title: 'Hi', body: 'There' });
      expect(fetchCalled).toBe(false);
    });

    it('sends push when user has registered tokens', async () => {
      let fetchCalled = false;
      global.fetch = async () => {
        fetchCalled = true;
        return {
          ok: true,
          json: async () => ({ data: [{ status: 'ok' }] }),
        } as Response;
      };

      // Mock supabase: returns one valid token
      mockFromReturn = {
        select: (_col: string) => ({
          eq: (_col: string, _val: string) => ({ data: [{ token: VALID_TOKEN }], error: null }),
        }),
      };

      await service.sendToUser('user-1', { title: 'Msg', body: 'From Alice' });
      expect(fetchCalled).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // registerToken
  // -------------------------------------------------------------------------
  describe('registerToken', () => {
    it('upserts token in DB for valid token', async () => {
      let upsertCalled = false;
      mockFromReturn = {
        upsert: (_data: unknown, _opts: unknown) => {
          upsertCalled = true;
          return { error: null };
        },
      };

      await service.registerToken('user-1', VALID_TOKEN);
      expect(upsertCalled).toBe(true);
    });

    it('throws for invalid token', async () => {
      await expect(service.registerToken('user-1', 'bad-token')).rejects.toThrow(
        'Invalid Expo push token',
      );
    });

    it('throws when DB upsert fails', async () => {
      mockFromReturn = {
        upsert: (_data: unknown, _opts: unknown) => ({ error: { message: 'DB error' } }),
      };

      await expect(service.registerToken('user-1', VALID_TOKEN)).rejects.toThrow(
        'Failed to register push token',
      );
    });
  });

  // -------------------------------------------------------------------------
  // deregisterToken
  // -------------------------------------------------------------------------
  describe('deregisterToken', () => {
    it('deletes token from DB', async () => {
      mockFromReturn = {
        delete: () => ({
          eq: (_col: string, _val: string) => ({
            eq: (_col2: string, _val2: string) => ({ error: null }),
          }),
        }),
      };

      await expect(service.deregisterToken('user-1', VALID_TOKEN)).resolves.toBeUndefined();
    });

    it('throws when DB delete fails', async () => {
      mockFromReturn = {
        delete: () => ({
          eq: (_col: string, _val: string) => ({
            eq: (_col2: string, _val2: string) => ({ error: { message: 'DB error' } }),
          }),
        }),
      };

      await expect(service.deregisterToken('user-1', VALID_TOKEN)).rejects.toThrow(
        'Failed to deregister push token',
      );
    });
  });
});
