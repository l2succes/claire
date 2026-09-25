/**
 * The Settings "Loop detection" switch used to persist only to AsyncStorage,
 * while the server's detector gates on `user_preferences.loop_detection_enabled`.
 * The switch showed ON for accounts the server had OFF, and turning it off never
 * stopped detection. These tests pin the store to the server column.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useChatPreferencesStore } from '../stores/chatPreferencesStore';

let mockSession: { access_token: string; user: { id: string } } | null = null;
jest.mock('../services/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: mockSession } }) } },
}));
jest.mock('../services/platforms', () => ({ API_BASE_URL: 'http://api.test' }));

const CACHE_KEY = 'claire.settings.loopDetection.server';
const LEGACY_KEY = 'claire.settings.loopDetection';
const PRE_RENAME_KEY = 'claire.settings.promiseDetection';

type Call = { method: string; body?: Record<string, unknown> };

/** Fake /preferences backed by one server-side value. */
function mockServer(initial: boolean | undefined, opts: { failGet?: boolean; failPut?: boolean } = {}) {
  const server = { value: initial, calls: [] as Call[] };
  global.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    server.calls.push({ method, body });
    if ((method === 'GET' && opts.failGet) || (method === 'PUT' && opts.failPut)) {
      return { ok: false, status: 500, json: async () => ({ error: 'nope' }) } as unknown as Response;
    }
    if (method === 'PUT' && server.value !== undefined) server.value = body.loop_detection_enabled;
    const data = server.value === undefined ? {} : { loop_detection_enabled: server.value };
    return { ok: true, status: 200, json: async () => ({ success: true, data }) } as unknown as Response;
  }) as unknown as typeof fetch;
  return server;
}

const state = () => useChatPreferencesStore.getState();

beforeEach(async () => {
  await AsyncStorage.clear();
  mockSession = { access_token: 'token-a', user: { id: 'user-a' } };
  useChatPreferencesStore.setState({
    loopDetection: true,
    loopDetectionSource: 'none',
    loopDetectionLoading: false,
    loopDetectionUserId: null,
  });
});

describe('loop detection preference', () => {
  it('shows OFF when the server column is false, even with no local value', async () => {
    mockServer(false);
    await state().loadLoopDetection();
    expect(state().loopDetection).toBe(false);
    expect(state().loopDetectionSource).toBe('server');
  });

  it('treats a server that does not report the field as unavailable, not as ON', async () => {
    // A server that predates the column returns 200 and ignores writes to it.
    mockServer(undefined);
    await state().loadLoopDetection();
    expect(state().loopDetectionSource).toBe('none');
    await expect(state().setLoopDetection(false)).rejects.toThrow();
    expect(state().loopDetection).toBe(true);
  });

  it('writes the toggle to the server column', async () => {
    const server = mockServer(true);
    await state().loadLoopDetection();
    await state().setLoopDetection(false);
    expect(server.calls.at(-1)).toEqual({ method: 'PUT', body: { loop_detection_enabled: false } });
    expect(server.value).toBe(false);
    expect(state().loopDetection).toBe(false);
  });

  it('reverts and rethrows when the server rejects the write', async () => {
    mockServer(true, { failPut: true });
    await state().loadLoopDetection();
    await expect(state().setLoopDetection(false)).rejects.toThrow();
    expect(state().loopDetection).toBe(true);
    expect(state().loopDetectionSource).toBe('server');
  });

  it('paints from the cache, then lets the server win', async () => {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ userId: 'user-a', enabled: true }));
    mockServer(false, { failGet: true });
    await state().loadLoopDetection();
    expect(state().loopDetection).toBe(true);
    expect(state().loopDetectionSource).toBe('cache');

    mockServer(false);
    await state().loadLoopDetection();
    expect(state().loopDetection).toBe(false);
    expect(JSON.parse((await AsyncStorage.getItem(CACHE_KEY))!)).toEqual({ userId: 'user-a', enabled: false });
  });

  it('never shows another account\'s cached value', async () => {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ userId: 'user-b', enabled: false }));
    mockServer(true, { failGet: true });
    await state().loadLoopDetection();
    expect(state().loopDetectionSource).toBe('none');
  });

  it('resets to unknown when a different account signs in', async () => {
    mockServer(false);
    await state().loadLoopDetection();
    mockSession = { access_token: 'token-b', user: { id: 'user-b' } };
    mockServer(true, { failGet: true });
    await state().loadLoopDetection();
    expect(state().loopDetectionSource).toBe('none');
    expect(state().loopDetectionUserId).toBe('user-b');
  });

  it('does not let an in-flight load overwrite a newer toggle', async () => {
    mockServer(true);
    const load = state().loadLoopDetection();
    await state().setLoopDetection(false);
    await load;
    expect(state().loopDetection).toBe(false);
  });

  describe('legacy local-only value', () => {
    it('carries an explicit local OFF to the server once, then removes it', async () => {
      await AsyncStorage.setItem(LEGACY_KEY, '0');
      const server = mockServer(true);
      await state().loadLoopDetection();
      expect(server.value).toBe(false);
      expect(state().loopDetection).toBe(false);
      expect(await AsyncStorage.getItem(LEGACY_KEY)).toBeNull();
    });

    it('also migrates the pre-rename key', async () => {
      await AsyncStorage.setItem(PRE_RENAME_KEY, '0');
      const server = mockServer(true);
      await state().loadLoopDetection();
      expect(server.value).toBe(false);
      expect(await AsyncStorage.getItem(PRE_RENAME_KEY)).toBeNull();
    });

    it('never lets a local ON re-enable a server-side OFF', async () => {
      await AsyncStorage.setItem(LEGACY_KEY, '1');
      const server = mockServer(false);
      await state().loadLoopDetection();
      expect(server.calls.some((call) => call.method === 'PUT')).toBe(false);
      expect(state().loopDetection).toBe(false);
      expect(await AsyncStorage.getItem(LEGACY_KEY)).toBeNull();
    });

    it('keeps the legacy value to retry when the server is unreachable', async () => {
      await AsyncStorage.setItem(LEGACY_KEY, '0');
      mockServer(true, { failGet: true });
      await state().loadLoopDetection();
      expect(await AsyncStorage.getItem(LEGACY_KEY)).toBe('0');
    });

    it('is dropped once the user makes an explicit server-side choice', async () => {
      await AsyncStorage.setItem(LEGACY_KEY, '0');
      mockServer(true, { failGet: true });
      await state().loadLoopDetection();
      const server = mockServer(true);
      await state().setLoopDetection(true);
      expect(await AsyncStorage.getItem(LEGACY_KEY)).toBeNull();
      await state().loadLoopDetection();
      expect(server.value).toBe(true);
    });
  });
});
