import { pseudonymousOperationsRef } from './operations-privacy';
import { type DbRow, supabase } from './supabase';
import { buildOperationsUserDirectory, type OperationsUser } from './operations-user-directory';

type AuthDirectoryUser = { id: string; email?: string; created_at: string };

async function listAllAuthUsers(): Promise<AuthDirectoryUser[]> {
  const users: AuthDirectoryUser[] = [];
  const perPage = 1000;
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    users.push(...data.users.map((user: AuthDirectoryUser) => ({
      id: user.id,
      email: user.email,
      created_at: user.created_at,
    })));
    if (data.users.length < perPage) break;
  }
  return users;
}

export async function getOperationsUserDirectory(): Promise<{
  generatedAt: string;
  totals: { users: number; connected: number; attention: number; withoutPlatforms: number };
  users: OperationsUser[];
}> {
  const [authUsers, { data: profileData, error: profileError }, { data: sessionData, error: sessionError }] = await Promise.all([
    listAllAuthUsers(),
    supabase.from('users').select('id,is_demo').limit(5000),
    supabase.from('platform_sessions')
      .select('session_id,user_id,platform,status,created_at,last_connected_at,updated_at,operations_retired_at')
      .limit(5000),
  ]);
  if (profileError || sessionError) throw profileError || sessionError;

  const demoUserIds = new Set((profileData || [])
    .filter((row: DbRow) => Boolean(row.is_demo))
    .map((row: DbRow) => String(row.id)));

  const users = buildOperationsUserDirectory(
    authUsers.map((user: AuthDirectoryUser) => ({
      id: user.id,
      email: user.email || 'Email unavailable',
      created_at: user.created_at || null,
      is_demo: demoUserIds.has(user.id),
    })),
    (sessionData || []).map((row: DbRow) => ({
      session_id: String(row.session_id),
      user_id: String(row.user_id),
      platform: String(row.platform),
      status: typeof row.status === 'string' ? row.status : null,
      created_at: typeof row.created_at === 'string' ? row.created_at : null,
      updated_at: typeof row.updated_at === 'string' ? row.updated_at : null,
      last_connected_at: typeof row.last_connected_at === 'string' ? row.last_connected_at : null,
      operations_retired_at: typeof row.operations_retired_at === 'string' ? row.operations_retired_at : null,
    })),
    pseudonymousOperationsRef,
  );

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      users: users.length,
      connected: users.filter((user) => user.platforms.some((platform) => platform.state === 'connected')).length,
      attention: users.filter((user) => user.platforms.some((platform) => platform.state === 'attention')).length,
      withoutPlatforms: users.filter((user) => user.platforms.length === 0).length,
    },
    users,
  };
}
