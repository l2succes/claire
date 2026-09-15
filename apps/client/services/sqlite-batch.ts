/**
 * Multi-row INSERT batching for the on-device cache.
 *
 * Writing a large table a row at a time is the difference between seventy
 * statements and twenty-one thousand. The parts worth getting right are all
 * pure — parameter counts, placeholder counts, and duplicate keys — so they
 * live here rather than inside a function that needs a database to run.
 */

/**
 * Rows per INSERT statement.
 *
 * SQLite caps bound parameters per statement. At three parameters a row, 300
 * rows stays under even the most conservative historical limit (999).
 */
export const SQLITE_INSERT_CHUNK = 300;

export interface InsertBatch {
  /** `(?, ?, ?),(?, ?, ?)...` for this chunk. */
  placeholders: string;
  params: string[];
  rowCount: number;
}

/**
 * Build the batches for an `(id, payload, updated_at)` table.
 *
 * Rows are deduplicated by id, last one winning. SQLite rejects an
 * `ON CONFLICT DO UPDATE` that would touch the same row twice inside a single
 * statement, and a paginated walk can legitimately return the same record on
 * two pages when the underlying set shifts between them — so this is a
 * correctness requirement, not a tidy-up.
 */
export function buildPayloadInsertBatches(
  rows: ReadonlyArray<Record<string, unknown>>,
  updatedAt: string,
  chunkSize: number = SQLITE_INSERT_CHUNK,
): InsertBatch[] {
  const unique = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    if (typeof row.id === 'string') unique.set(row.id, row);
  }

  const deduped = [...unique.values()];
  const batches: InsertBatch[] = [];
  for (let start = 0; start < deduped.length; start += chunkSize) {
    const chunk = deduped.slice(start, start + chunkSize);
    const params: string[] = [];
    for (const row of chunk) {
      params.push(row.id as string, JSON.stringify(row), updatedAt);
    }
    batches.push({
      placeholders: chunk.map(() => '(?, ?, ?)').join(','),
      params,
      rowCount: chunk.length,
    });
  }
  return batches;
}
