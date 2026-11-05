import { authenticatedFetch } from '../services/authenticated-fetch';
import { fetchLoopDetail, updateLoop } from '../services/loops';
import { GENERIC_SERVER_ERROR } from '../services/api-errors';

jest.mock('../services/authenticated-fetch', () => ({
  authenticatedFetch: jest.fn(),
}));

const request = authenticatedFetch as jest.MockedFunction<typeof authenticatedFetch>;

describe('loops API authentication', () => {
  beforeEach(() => {
    request.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { id: 'loop-1', status: 'done' } }),
    } as Response);
  });

  afterEach(() => jest.clearAllMocks());

  it('uses the refresh-and-retry authenticated request path for mutations', async () => {
    await updateLoop('loop-1', { status: 'done' });

    expect(request).toHaveBeenCalledWith(expect.stringMatching(/\/loops\/loop-1$/), {
      method: 'PATCH',
      body: JSON.stringify({ status: 'done' }),
      headers: { 'Content-Type': 'application/json' },
    });
  });

  it('retains HTTP status so cached detail can distinguish deletion from a temporary failure', async () => {
    request.mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: 'Loop not found' }) } as Response);
    await expect(fetchLoopDetail('loop-1')).rejects.toMatchObject({ status: 404, message: 'Loop not found' });
  });

  it('does not render internal server errors in the detail screen', async () => {
    request.mockResolvedValue({ ok: false, status: 503, json: async () => ({ error: 'internal database relation missing' }) } as Response);
    await expect(fetchLoopDetail('loop-1')).rejects.toMatchObject({ status: 503, message: GENERIC_SERVER_ERROR });
  });
});
