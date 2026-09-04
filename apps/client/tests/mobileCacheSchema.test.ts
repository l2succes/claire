/**
 * The encrypted cache had two functions reading and writing a table that was
 * never created. Every caller swallowed the rejection, so conversation settings
 * silently never cached on iOS while the code read as though they did. These
 * tests pin the schema and the memoisation that the local-first work depends on.
 */

type SqlLog = string[];

function mockNativeSqlite() {
  const sql: SqlLog = [];
  const rows = new Map<string, Array<Record<string, unknown>>>();
  const db = {
    execAsync: jest.fn(async (statement: string) => { sql.push(statement); }),
    runAsync: jest.fn(async (statement: string, ..._args: unknown[]) => { sql.push(statement); }),
    getAllAsync: jest.fn(async (statement: string) => {
      sql.push(statement);
      if (statement.includes('cache_chats')) return rows.get('chats') ?? [];
      return [];
    }),
    getFirstAsync: jest.fn(async (statement: string) => { sql.push(statement); return null; }),
    withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => { await fn(); }),
    closeAsync: jest.fn(async () => undefined),
  };
  jest.doMock('react-native', () => ({ Platform: { OS: 'ios' } }));
  jest.doMock('expo-sqlite', () => ({
    openDatabaseAsync: jest.fn(async () => db),
    deleteDatabaseAsync: jest.fn(async () => undefined),
  }), { virtual: true });
  jest.doMock('expo-secure-store', () => ({
    getItemAsync: jest.fn(async () => 'ab'.repeat(32)),
    setItemAsync: jest.fn(async () => undefined),
    deleteItemAsync: jest.fn(async () => undefined),
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'whenUnlocked',
  }), { virtual: true });
  jest.doMock('expo-crypto', () => ({
    getRandomBytesAsync: jest.fn(async () => new Uint8Array(32)),
  }), { virtual: true });
  return { sql, db, rows };
}

describe('encrypted cache schema', () => {
  beforeEach(() => { jest.resetModules(); });

  it('creates every table the module reads from', async () => {
    const { sql, db } = mockNativeSqlite();
    const cache = require('../services/mobile-cache.native') as typeof import('../services/mobile-cache.native');
    await cache.hydrateMobileCache('user-1');

    const schema = sql.join('\n');
    // Each of these is read or written by an exported function. A missing one
    // is a silent no-op in production, not a crash.
    for (const table of [
      'cache_meta',
      'cache_chats',
      'cache_messages',
      'cache_contacts',
      'cache_loops',
      'cache_conversation_settings',
      'cache_queries',
    ]) {
      expect(schema).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
    // Stamped as a bind parameter, so assert on the arguments rather than SQL.
    expect(db.runAsync.mock.calls.some((call) => call[1] === 'schema_version')).toBe(true);
  });

  it('every table the module queries exists in the schema', () => {
    const { sql: _sql } = mockNativeSqlite();
    const cache = require('../services/mobile-cache.native') as typeof import('../services/mobile-cache.native');
    const source = require('fs').readFileSync(require.resolve('../services/mobile-cache.native'), 'utf8') as string;

    const declared = new Set([...cache.SCHEMA_SQL.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map((m) => m[1]));
    const queried = new Set([...source.matchAll(/(?:FROM|INTO|UPDATE)\s+(cache_\w+)/g)].map((m) => m[1]));

    for (const table of queried) expect([...declared]).toContain(table);
  });
});

describe('snapshot memoisation', () => {
  beforeEach(() => { jest.resetModules(); });

  it('reads the tables once and serves later calls from memory', async () => {
    const { db } = mockNativeSqlite();
    const cache = require('../services/mobile-cache.native') as typeof import('../services/mobile-cache.native');

    await cache.hydrateMobileCache('user-1');
    const afterFirst = db.getAllAsync.mock.calls.length;
    await cache.hydrateMobileCache('user-1');
    await cache.hydrateMobileCache('user-1');

    expect(db.getAllAsync.mock.calls.length).toBe(afterFirst);
  });

  it('shares one read between callers racing in the same tick', async () => {
    const { db } = mockNativeSqlite();
    const cache = require('../services/mobile-cache.native') as typeof import('../services/mobile-cache.native');

    await Promise.all([
      cache.hydrateMobileCache('user-1'),
      cache.hydrateMobileCache('user-1'),
      cache.hydrateMobileCache('user-1'),
    ]);

    // Two table reads for one hydrate: cache_chats and cache_loops.
    expect(db.getAllAsync.mock.calls.length).toBe(2);
  });

  it('re-reads after a write invalidates the snapshot', async () => {
    const { db } = mockNativeSqlite();
    const cache = require('../services/mobile-cache.native') as typeof import('../services/mobile-cache.native');

    await cache.hydrateMobileCache('user-1');
    const afterFirst = db.getAllAsync.mock.calls.length;
    await cache.setFullHistoryEnabled('user-1', true);
    await cache.hydrateMobileCache('user-1');

    expect(db.getAllAsync.mock.calls.length).toBeGreaterThan(afterFirst);
  });
});
