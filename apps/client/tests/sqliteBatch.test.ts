/**
 * INSERT batching. Every assertion here is something that only fails at
 * runtime, on device, inside a transaction — a mismatched parameter count or a
 * duplicate key throws from SQLite, not from the type checker.
 */
import { buildPayloadInsertBatches, SQLITE_INSERT_CHUNK } from '../services/sqlite-batch';

const rows = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ id: `c${index}`, name: `Person ${index}` }));

describe('buildPayloadInsertBatches', () => {
  it('binds exactly three parameters per placeholder group', () => {
    // The failure this prevents is "Incorrect number of query parameters",
    // which only surfaces once the statement reaches SQLite.
    for (const batch of buildPayloadInsertBatches(rows(1000), 'now')) {
      expect(batch.placeholders.split('),(').length).toBe(batch.rowCount);
      expect(batch.params.length).toBe(batch.rowCount * 3);
    }
  });

  it('stays under the most conservative SQLite parameter limit', () => {
    for (const batch of buildPayloadInsertBatches(rows(5000), 'now')) {
      expect(batch.params.length).toBeLessThanOrEqual(999);
    }
  });

  it('turns a large directory into few statements', () => {
    // The whole point: 21,000 rows used to be 21,000 statements.
    const batches = buildPayloadInsertBatches(rows(21_000), 'now');
    expect(batches.length).toBe(Math.ceil(21_000 / SQLITE_INSERT_CHUNK));
    expect(batches.reduce((total, batch) => total + batch.rowCount, 0)).toBe(21_000);
  });

  it('deduplicates by id, keeping the last occurrence', () => {
    // A paginated walk can return the same record on two pages. Left in, SQLite
    // rejects the whole statement: "ON CONFLICT DO UPDATE command does not
    // affect row a second time".
    const batches = buildPayloadInsertBatches(
      [{ id: 'a', name: 'stale' }, { id: 'b', name: 'B' }, { id: 'a', name: 'fresh' }],
      'now',
    );
    expect(batches).toHaveLength(1);
    expect(batches[0]!.rowCount).toBe(2);
    expect(batches[0]!.params[1]).toContain('fresh');
  });

  it('skips rows with no usable id rather than binding undefined', () => {
    const batches = buildPayloadInsertBatches(
      [{ id: 'a' }, { id: undefined }, {}, { id: 42 }],
      'now',
    );
    expect(batches[0]!.rowCount).toBe(1);
    expect(batches[0]!.params).toEqual(['a', JSON.stringify({ id: 'a' }), 'now']);
  });

  it('returns nothing for an empty directory', () => {
    // The caller still runs its DELETE, so an empty sync clears the cache
    // instead of looping zero times over a statement it never builds.
    expect(buildPayloadInsertBatches([], 'now')).toEqual([]);
  });

  it('puts the id, payload and timestamp in that order', () => {
    const batches = buildPayloadInsertBatches([{ id: 'a', name: 'Ada' }], 'stamp');
    expect(batches[0]!.params).toEqual(['a', JSON.stringify({ id: 'a', name: 'Ada' }), 'stamp']);
  });
});
