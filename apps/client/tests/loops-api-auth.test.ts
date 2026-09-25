import { authenticatedFetch } from '../services/authenticated-fetch';
import { updateLoop } from '../services/loops';

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
});
