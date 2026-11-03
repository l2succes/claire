/**
 * Text checks for the migrations that narrow what the anon and authenticated
 * roles may do. Like rls-audit.test.ts, these run without Postgres; the
 * statements were also exercised against a local database when written.
 */

import { describe, expect, it } from 'bun:test';
import fs from 'fs';
import path from 'path';

const MIGRATIONS = path.resolve(__dirname, '../../../../supabase/migrations');
const read = (name: string) => fs.readFileSync(path.join(MIGRATIONS, name), 'utf8');
const compact = (sql: string) => sql.replace(/--.*$/gm, '').replace(/\s+/g, ' ');

describe('client privilege migrations', () => {
  it('leaves platform_sessions readable but not writable by clients', () => {
    const sql = compact(read('20261103000001_platform_sessions_read_only_for_clients.sql'));
    expect(sql).toContain('DROP POLICY IF EXISTS "Users can manage own platform sessions" ON public.platform_sessions');
    expect(sql).toMatch(/CREATE POLICY "Users can view own platform sessions" ON public\.platform_sessions FOR SELECT USING \(auth\.uid\(\) = user_id\)/);
    expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public\.platform_sessions FROM anon, authenticated/);
    expect(sql).not.toMatch(/FOR ALL/i);
  });

  it('drops the platform_message_stats view', () => {
    expect(compact(read('20261103000002_drop_platform_message_stats.sql'))).toContain('DROP VIEW IF EXISTS public.platform_message_stats');
  });

  it('revokes client execute on server-only SECURITY DEFINER functions', () => {
    const sql = compact(read('20261103000003_revoke_client_execute_on_internal_functions.sql'));
    for (const fn of [
      'increment_chat_unread(UUID, UUID)',
      'reconcile_matrix_read_receipt(UUID, TEXT, TEXT, TEXT)',
      'purge_expired_operations_data()',
    ]) {
      expect(sql).toContain(`REVOKE EXECUTE ON FUNCTION public.${fn} FROM anon, authenticated`);
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${fn} TO service_role`);
    }
  });

  it('limits profile updates to display columns', () => {
    const sql = compact(read('20261103000004_limit_user_profile_updates.sql'));
    expect(sql).toContain('REVOKE UPDATE ON public.users FROM anon, authenticated');
    expect(sql).toContain('GRANT UPDATE (name, avatar_url, updated_at) ON public.users TO authenticated');
  });

  it('no client code writes platform_sessions or updates users', () => {
    const clientRoots = ['apps/client', 'apps/desktop/src', 'packages'].map((root) => path.resolve(__dirname, '../../../..', root));
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (['node_modules', 'ios', 'android', '.expo', 'dist', 'renderer'].includes(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name)) {
          const source = fs.readFileSync(full, 'utf8');
          if (/from\(['"]platform_sessions['"]\)\s*\.\s*(insert|upsert|update|delete)/.test(source)
            || /from\(['"]users['"]\)\s*\.\s*(upsert|update)/.test(source)) offenders.push(full);
        }
      }
    };
    clientRoots.filter((root) => fs.existsSync(root)).forEach(walk);
    expect(offenders).toEqual([]);
  });
});
