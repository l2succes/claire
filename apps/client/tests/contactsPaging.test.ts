import { contactsApi, type PersonContact } from '../services/contacts';

jest.mock('../services/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }) } },
}));
jest.mock('../services/platforms', () => ({ API_BASE_URL: 'http://api.test' }));

const person = (id: string): PersonContact => ({
  id, name: `Person ${id}`, phone_number: null, is_group: false,
});

function mockPages(pages: Array<{ contacts: PersonContact[]; nextOffset: number | null }>) {
  const calls: string[] = [];
  let index = 0;
  global.fetch = jest.fn(async (url: string) => {
    calls.push(String(url));
    const page = pages[index++] ?? { contacts: [], nextOffset: null };
    return { ok: true, status: 200, json: async () => ({ data: page }) } as unknown as Response;
  }) as unknown as typeof fetch;
  return calls;
}

describe('contactsApi.listAll', () => {
  it('walks every page and returns one complete directory', async () => {
    const calls = mockPages([
      { contacts: [person('a'), person('b')], nextOffset: 500 },
      { contacts: [person('c')], nextOffset: null },
    ]);
    const all = await contactsApi.listAll({ query: '', platform: 'all', filter: 'all' });
    expect(all.map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect(calls).toHaveLength(2);
  });

  it('never asks for the 10k page that made the API return 500', async () => {
    // The exact page size is tuned to what the deployed API accepts, so assert
    // the property rather than the number: it must be bounded and well under
    // the ceiling that was returning 500.
    const calls = mockPages([{ contacts: [person('a')], nextOffset: null }]);
    await contactsApi.listAll({ query: '', platform: 'all', filter: 'all' });
    const limit = Number(new URL(calls[0]).searchParams.get('limit'));
    expect(limit).toBeGreaterThan(0);
    expect(limit).toBeLessThanOrEqual(500);
  });

  it('stops when a page comes back empty, even with a nextOffset', async () => {
    // A server that keeps handing back a cursor must not spin forever.
    const calls = mockPages([
      { contacts: [person('a')], nextOffset: 500 },
      { contacts: [], nextOffset: 1000 },
    ]);
    const all = await contactsApi.listAll({ query: '', platform: 'all', filter: 'all' });
    expect(all).toHaveLength(1);
    expect(calls).toHaveLength(2);
  });

  it('is bounded even if nextOffset never terminates', async () => {
    const calls = mockPages(
      Array.from({ length: 100 }, () => ({ contacts: [person('x')], nextOffset: 500 })),
    );
    await contactsApi.listAll({ query: '', platform: 'all', filter: 'all' });
    expect(calls.length).toBeLessThanOrEqual(40);
  });
});
