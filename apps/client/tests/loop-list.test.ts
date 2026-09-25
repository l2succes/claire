import { fetchLoopList } from '../services/loop-list';

const mockRange = jest.fn();
const mockQuery = {
  select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(), range: mockRange,
};
jest.mock('../services/supabase', () => ({ supabase: { from: () => mockQuery } }));

beforeEach(() => mockRange.mockReset());

it('includes low-priority and newly created loops after the first 200 rows', async () => {
  const first = Array.from({ length: 200 }, (_, i) => ({ id: `loop-${i}` }));
  mockRange.mockResolvedValueOnce({ data: first, error: null });
  mockRange.mockResolvedValueOnce({ data: [{ id: 'new-loop' }], error: null });
  const loops = await fetchLoopList('user-1');
  expect(loops).toHaveLength(201);
  expect(loops[200].id).toBe('new-loop');
  expect(mockRange).toHaveBeenNthCalledWith(2, 200, 399);
});

it('does not replace the cache with a partial collection when a page fails', async () => {
  mockRange.mockResolvedValueOnce({ data: Array.from({ length: 200 }, () => ({ id: 'loop' })), error: null });
  mockRange.mockResolvedValueOnce({ data: null, error: new Error('offline') });
  await expect(fetchLoopList('user-1')).rejects.toThrow('offline');
});
