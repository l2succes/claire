/**
 * Unit tests for schema-drift verification (#99).
 * Supabase is mocked so a per-table "missing column/table" error can be simulated.
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';

// Per-table error the mocked supabase client should return (null = column exists).
let errorByTable: Record<string, { code?: string; message?: string } | null> = {};

mock.module('./supabase', () => ({
  supabase: {
    from: (table: string) => ({
      select: (_columns: string) => ({
        limit: async (_n: number) => ({ data: [], error: errorByTable[table] ?? null }),
      }),
    }),
  },
}));

mock.module('../utils/logger', () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
  stream: { write: () => {} },
}));

const {
  verifySchema,
  verifySchemaCached,
  resetSchemaVerificationCache,
  isMissingSchemaError,
} = await import('./schema-verification');

const REQS = [
  { table: 'present_table', columns: ['a', 'b'] },
  { table: 'missing_table', columns: ['c'] },
];

describe('schema-verification (#99)', () => {
  beforeEach(() => {
    errorByTable = {};
    resetSchemaVerificationCache();
  });

  describe('isMissingSchemaError', () => {
    it('flags undefined column/table Postgres codes', () => {
      expect(isMissingSchemaError({ code: '42703', message: 'column x does not exist' })).toBe(true);
      expect(isMissingSchemaError({ code: '42P01', message: 'relation y does not exist' })).toBe(true);
    });

    it('flags PostgREST schema-cache codes and messages', () => {
      expect(isMissingSchemaError({ code: 'PGRST205', message: 'Could not find the table' })).toBe(true);
      expect(isMissingSchemaError({ message: "column messages.snoozed_until does not exist" })).toBe(true);
    });

    it('does NOT flag transient/operational errors', () => {
      expect(isMissingSchemaError({ code: '08006', message: 'connection failure' })).toBe(false);
      expect(isMissingSchemaError({ code: 'PGRST301', message: 'JWT expired' })).toBe(false);
      expect(isMissingSchemaError(null)).toBe(false);
    });
  });

  describe('verifySchema', () => {
    it('reports ok when every required table/column resolves', async () => {
      const result = await verifySchema([{ table: 'present_table', columns: ['a', 'b'] }]);
      expect(result.ok).toBe(true);
      expect(result.drift).toHaveLength(0);
      expect(result.checkedTables).toBe(1);
    });

    it('reports drift for a missing table', async () => {
      errorByTable = {
        missing_table: { code: '42P01', message: 'relation "missing_table" does not exist' },
      };
      const result = await verifySchema(REQS);
      expect(result.ok).toBe(false);
      expect(result.drift.map((d) => d.table)).toEqual(['missing_table']);
      expect(result.checkedTables).toBe(2);
    });

    it('reports drift for a missing column', async () => {
      errorByTable = {
        present_table: { code: '42703', message: 'column present_table.b does not exist' },
      };
      const result = await verifySchema([{ table: 'present_table', columns: ['a', 'b'] }]);
      expect(result.ok).toBe(false);
      expect(result.drift[0]?.columns).toEqual(['a', 'b']);
    });

    it('does not treat a transient error as drift', async () => {
      errorByTable = { present_table: { code: '08006', message: 'connection failure' } };
      const result = await verifySchema([{ table: 'present_table', columns: ['a'] }]);
      expect(result.ok).toBe(true);
      expect(result.drift).toHaveLength(0);
    });
  });

  describe('verifySchemaCached', () => {
    it('caches the result until reset', async () => {
      // First call: everything ok, cached.
      const first = await verifySchemaCached(60_000);
      expect(first.ok).toBe(true);

      // Introduce drift on a real required table; cache should hide it.
      errorByTable = { messages: { code: '42703', message: 'column messages.snoozed_until does not exist' } };
      const cached = await verifySchemaCached(60_000);
      expect(cached.ok).toBe(true);

      // After reset, the drift is observed.
      resetSchemaVerificationCache();
      const fresh = await verifySchemaCached(60_000);
      expect(fresh.ok).toBe(false);
      expect(fresh.drift.some((d) => d.table === 'messages')).toBe(true);
    });
  });
});
