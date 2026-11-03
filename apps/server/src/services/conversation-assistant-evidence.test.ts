import { describe, expect, it } from 'bun:test';
import { loadEvidenceExcerpt, type EvidenceAnchor } from './conversation-assistant-evidence';

type Row = {
  id: string;
  user_id: string;
  chat_id: string;
  content: string | null;
  contact_name: string | null;
  from_me: boolean;
  timestamp: string;
  is_deleted: boolean;
};

const ANCHOR_TIME = Date.parse('2026-10-14T12:00:00.000Z');
const minutes = (offset: number) => new Date(ANCHOR_TIME + offset * 60_000).toISOString();
const asTime = (value: unknown) => new Date(String(value)).getTime();

function row(id: string, offsetMinutes: number, overrides: Partial<Row> = {}): Row {
  return {
    id,
    user_id: 'user-1',
    chat_id: 'chat-1',
    content: `text of ${id}`,
    contact_name: 'Sam',
    from_me: false,
    timestamp: minutes(offsetMinutes),
    is_deleted: false,
    ...overrides,
  };
}

const anchor = (overrides: Partial<EvidenceAnchor> = {}): EvidenceAnchor => ({
  messageId: 'anchor',
  chatId: 'chat-1',
  excerpt: 'the matched message',
  senderName: 'Sam',
  fromMe: false,
  timestamp: minutes(0),
  ...overrides,
});

/** Applies the filters the query uses to in-memory rows. */
function fakeDb(rows: Row[], error: unknown = null) {
  return {
    from: () => {
      let result = [...rows];
      const sorts: Array<{ column: keyof Row; ascending: boolean }> = [];
      const query: any = {
        select: () => query,
        eq: (column: keyof Row, value: unknown) => { result = result.filter((item) => item[column] === value); return query; },
        neq: (column: keyof Row, value: unknown) => { result = result.filter((item) => item[column] !== value); return query; },
        not: (column: keyof Row) => { result = result.filter((item) => item[column] !== null); return query; },
        gte: (_column: string, value: unknown) => { result = result.filter((item) => asTime(item.timestamp) >= asTime(value)); return query; },
        lte: (_column: string, value: unknown) => { result = result.filter((item) => asTime(item.timestamp) <= asTime(value)); return query; },
        order: (column: keyof Row, options: { ascending: boolean }) => { sorts.push({ column, ascending: options.ascending }); return query; },
        limit: (count: number) => {
          const sorted = result.sort((a, b) => {
            for (const { column, ascending } of sorts) {
              const order = String(a[column]).localeCompare(String(b[column]));
              if (order) return ascending ? order : -order;
            }
            return 0;
          });
          return Promise.resolve(error ? { data: null, error } : { data: sorted.slice(0, count), error: null });
        },
      };
      return query;
    },
  } as any;
}

describe('loadEvidenceExcerpt', () => {
  it('keeps the match in a chat busier than the excerpt limit, with its nearest neighbors in order', async () => {
    const busyHour = Array.from({ length: 100 }, (_, index) => {
      const offset = index - 50;
      return row(`m${String(index).padStart(2, '0')}`, offset === 0 ? -60 : offset);
    });

    const excerpt = await loadEvidenceExcerpt(fakeDb(busyHour), 'user-1', anchor());

    expect(excerpt?.split('\n')).toEqual([
      'Sam: text of m46',
      'Sam: text of m47',
      'Sam: text of m48',
      'Sam: text of m49',
      '→ Sam: the matched message',
      'Sam: text of m51',
      'Sam: text of m52',
      'Sam: text of m53',
      'Sam: text of m54',
    ]);
  });

  it('labels your own messages as You', async () => {
    const excerpt = await loadEvidenceExcerpt(fakeDb([row('reply', 1, { from_me: true })]), 'user-1', anchor({ fromMe: true }));
    expect(excerpt).toBe('→ You: the matched message\nYou: text of reply');
  });

  it('leaves out deleted messages, other chats, other users, empty content and anything over 12 hours away', async () => {
    const excerpt = await loadEvidenceExcerpt(fakeDb([
      row('kept', -1),
      row('deleted', -2, { is_deleted: true }),
      row('other-chat', -3, { chat_id: 'chat-2' }),
      row('other-user', -4, { user_id: 'user-2' }),
      row('empty', -5, { content: null }),
      row('too-old', -(12 * 60 + 1)),
      row('too-new', 12 * 60 + 1),
    ]), 'user-1', anchor());
    expect(excerpt).toBe('Sam: text of kept\n→ Sam: the matched message');
  });

  it('does not repeat a message that shares the anchor timestamp', async () => {
    const excerpt = await loadEvidenceExcerpt(fakeDb([row('tied', 0)]), 'user-1', anchor());
    expect(excerpt?.match(/text of tied/g)).toHaveLength(1);
  });

  it('keeps the whole match when long neighbors overflow the excerpt', async () => {
    const long = 'x'.repeat(400);
    const match = `${'y'.repeat(699)}!`;
    const rows = [-4, -3, -2, -1, 1, 2, 3, 4].map((offset) => row(`m${offset}`, offset, { content: long }));

    const excerpt = await loadEvidenceExcerpt(fakeDb(rows), 'user-1', anchor({ excerpt: match }));

    expect(excerpt).toContain(`→ Sam: ${match}`);
    expect(excerpt?.length).toBeLessThanOrEqual(1_600);
  });

  it('returns null when there is no context or it cannot be read', async () => {
    expect(await loadEvidenceExcerpt(fakeDb([]), 'user-1', anchor())).toBeNull();
    expect(await loadEvidenceExcerpt(fakeDb([row('near', 1)], new Error('read failed')), 'user-1', anchor())).toBeNull();
  });
});
