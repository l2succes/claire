import { contactsApi } from '../services/contacts';
import { authenticatedFetch } from '../services/authenticated-fetch';

jest.mock('../services/platforms', () => ({ API_BASE_URL: 'http://api.test' }));
jest.mock('../services/authenticated-fetch', () => ({ authenticatedFetch: jest.fn() }));
const fetchMock = authenticatedFetch as jest.MockedFunction<typeof authenticatedFetch>;
const params = { query: '', platform: 'all' as const, filter: 'all' as const };

beforeEach(() => {
  jest.useFakeTimers();
  fetchMock.mockReset();
});
afterEach(() => jest.useRealTimers());

function pendingUntilAbort(signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true }));
}

it('times out a response body that stalls after headers arrive', async () => {
  let signal!: AbortSignal;
  fetchMock.mockImplementation(async (_url, init) => {
    signal = init!.signal as AbortSignal;
    return { ok: true, status: 200, json: () => pendingUntilAbort(signal) } as unknown as Response;
  });
  const result = contactsApi.list(params).catch((error: Error) => error);

  await jest.advanceTimersByTimeAsync(30_000);
  expect(signal.aborted).toBe(true);
  expect(await result).toEqual(new Error('People took too long to load. Try again.'));
  expect(jest.getTimerCount()).toBe(0);
});

it('uses one deadline for headers and body together', async () => {
  let signal!: AbortSignal;
  fetchMock.mockImplementation((_url, init) => {
    signal = init!.signal as AbortSignal;
    return new Promise((resolve) => setTimeout(() => resolve({
      ok: true, status: 200, json: () => pendingUntilAbort(signal),
    } as unknown as Response), 20_000));
  });
  const result = contactsApi.list(params).catch((error: Error) => error);

  await jest.advanceTimersByTimeAsync(29_999);
  expect(signal.aborted).toBe(false);
  await jest.advanceTimersByTimeAsync(1);
  expect(signal.aborted).toBe(true);
  expect(await result).toEqual(new Error('People took too long to load. Try again.'));
});

it('still times out when headers never arrive', async () => {
  fetchMock.mockImplementation((_url, init) => pendingUntilAbort(init!.signal as AbortSignal));
  const result = contactsApi.list(params).catch((error: Error) => error);
  await jest.advanceTimersByTimeAsync(30_000);
  expect(await result).toEqual(new Error('People took too long to load. Try again.'));
});

it('returns a body completed within the deadline and clears its timer', async () => {
  const page = { contacts: [], nextOffset: null };
  fetchMock.mockResolvedValue({
    ok: true, status: 200,
    json: () => new Promise((resolve) => setTimeout(() => resolve({ data: page }), 29_000)),
  } as Response);
  const result = contactsApi.list(params);
  await jest.advanceTimersByTimeAsync(29_000);
  expect(await result).toEqual(page);
  expect(jest.getTimerCount()).toBe(0);
});
