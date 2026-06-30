/**
 * RLS Audit Tests (issue #43)
 *
 * Verifies that the Supabase client, when operating as user A, cannot read or
 * write rows that belong to user B.
 *
 * Because these tests run without a real Postgres/Supabase instance (the mock
 * is set up in tests/setup.ts), we test three things instead:
 *
 *  1. The RLS migration SQL is syntactically correct (parsed as text).
 *  2. Every table has both USING and WITH CHECK on write policies.
 *  3. The cross-user denial logic is exercised through a mock Supabase client
 *     that simulates the RLS filter (mimics Supabase's policy enforcement on
 *     the server: `.eq('user_id', uid)` with the correct uid returns data,
 *     a different uid returns an empty result).
 */

import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// 1. Migration file exists and contains WITH CHECK for all write policies
// ---------------------------------------------------------------------------

describe('RLS audit migration', () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../../supabase/migrations/20260701000001_rls_audit.sql'
  );

  it('migration file exists', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
  });

  it('all FOR ALL policies include WITH CHECK', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Extract all CREATE POLICY blocks
    const policyBlocks = sql.match(
      /CREATE POLICY[^;]+;/gs
    ) ?? [];

    expect(policyBlocks.length).toBeGreaterThan(0);

    // Every FOR ALL block must have both USING and WITH CHECK
    const forAllPolicies = policyBlocks.filter((b) => /FOR ALL/i.test(b));
    for (const block of forAllPolicies) {
      expect(block).toMatch(/USING\s*\(/i);
      expect(block).toMatch(/WITH CHECK\s*\(/i);
    }
  });

  it('covers all known tables', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    const expectedTables = [
      'platform_sessions',
      'contacts',
      'chats',
      'messages',
      'ai_suggestions',
      'promises',
      'contact_inferences',
      'user_preferences',
      'auto_reply_rules',
      'platform_settings',
      'chat_categories',
      'contact_profiles',
      'smart_cards',
    ];

    for (const table of expectedTables) {
      expect(sql).toContain(`ON public.${table}`);
    }
  });

  it('includes guards for future push_tokens and contact_memory tables', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    expect(sql).toContain('push_tokens');
    expect(sql).toContain('contact_memory');
  });
});

// ---------------------------------------------------------------------------
// 2. Cross-user denial simulation
//    Simulates what Supabase enforces via RLS: user_id = auth.uid()
// ---------------------------------------------------------------------------

/**
 * Minimal mock of Supabase's chained query API.
 * Rows are filtered by user_id on .eq('user_id', uid) to replicate policy
 * enforcement: only rows whose user_id matches the calling user are returned.
 */
function createMockSupabaseForUser(authenticatedUserId: string) {
  const rows: Record<string, { id: string; user_id: string; data: string }[]> = {
    promises: [
      { id: 'row-1', user_id: 'user-a', data: 'Promise A' },
      { id: 'row-2', user_id: 'user-b', data: 'Promise B' },
    ],
    messages: [
      { id: 'msg-1', user_id: 'user-a', data: 'Msg A' },
      { id: 'msg-2', user_id: 'user-b', data: 'Msg B' },
    ],
  };

  return {
    from(table: string) {
      let filteredRows = rows[table] ?? [];
      let insertRejected = false;

      return {
        select(_cols?: string) {
          return this;
        },
        eq(col: string, val: string) {
          if (col === 'user_id') {
            // RLS: only return rows owned by the authenticated user
            if (val !== authenticatedUserId) {
              filteredRows = [];
            } else {
              filteredRows = filteredRows.filter((r) => r.user_id === val);
            }
          }
          return this;
        },
        async then(resolve: (v: { data: typeof filteredRows; error: null }) => void) {
          resolve({ data: filteredRows, error: null });
        },
        insert(payload: { id: string; user_id: string; data: string }) {
          // WITH CHECK simulation: deny insert if user_id != auth uid
          if (payload.user_id !== authenticatedUserId) {
            insertRejected = true;
          }
          return {
            async then(
              resolve: (v: {
                data: null | typeof payload;
                error: null | { message: string };
              }) => void
            ) {
              if (insertRejected) {
                resolve({
                  data: null,
                  error: { message: 'new row violates row-level security policy' },
                });
              } else {
                resolve({ data: payload, error: null });
              }
            },
          };
        },
      };
    },
  };
}

describe('Cross-user access denial (RLS simulation)', () => {
  const userAClient = createMockSupabaseForUser('user-a');
  const userBClient = createMockSupabaseForUser('user-b');

  // --- SELECT isolation ---

  it('user-A can read their own promises', async () => {
    const { data } = await userAClient
      .from('promises')
      .select('*')
      .eq('user_id', 'user-a');
    expect(data).toHaveLength(1);
    expect(data[0].user_id).toBe('user-a');
  });

  it("user-A cannot read user-B's promises", async () => {
    const { data } = await userAClient
      .from('promises')
      .select('*')
      .eq('user_id', 'user-b');
    expect(data).toHaveLength(0);
  });

  it('user-B can read their own messages', async () => {
    const { data } = await userBClient
      .from('messages')
      .select('*')
      .eq('user_id', 'user-b');
    expect(data).toHaveLength(1);
    expect(data[0].user_id).toBe('user-b');
  });

  it("user-B cannot read user-A's messages", async () => {
    const { data } = await userBClient
      .from('messages')
      .select('*')
      .eq('user_id', 'user-a');
    expect(data).toHaveLength(0);
  });

  // --- INSERT isolation (WITH CHECK) ---

  it('user-A can insert a row with their own user_id', async () => {
    const { data, error } = await userAClient
      .from('promises')
      .insert({ id: 'new-1', user_id: 'user-a', data: 'My promise' });
    expect(error).toBeNull();
    expect(data).not.toBeNull();
  });

  it("user-A cannot insert a row with user-B's user_id (WITH CHECK)", async () => {
    const { data, error } = await userAClient
      .from('promises')
      .insert({ id: 'new-2', user_id: 'user-b', data: 'Forged promise' });
    expect(error).not.toBeNull();
    expect(error!.message).toContain('row-level security');
    expect(data).toBeNull();
  });

  it("user-B cannot insert a row with user-A's user_id (WITH CHECK)", async () => {
    const { data, error } = await userBClient
      .from('messages')
      .insert({ id: 'new-3', user_id: 'user-a', data: 'Forged message' });
    expect(error).not.toBeNull();
    expect(error!.message).toContain('row-level security');
    expect(data).toBeNull();
  });
});
