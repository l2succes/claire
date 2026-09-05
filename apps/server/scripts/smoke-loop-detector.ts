/**
 * End-to-end production-safe smoke test for Open Loops.
 *
 * It creates a disposable confirmed user and synthetic WhatsApp conversation,
 * runs one inline detection pass, verifies that a loop and its evidence were
 * persisted, then deletes the test account. No real conversation is read and
 * the production queue/feature flag are left untouched.
 *
 * Run with production variables injected, for example:
 *   railway run ... -- sh -c 'LOOP_DETECTION_MODE=inline bun run scripts/smoke-loop-detector.ts'
 */

import { randomUUID } from 'node:crypto';

import { authHelpers, supabase } from '../src/services/supabase';

process.env.LOOP_DETECTION_MODE = 'inline';

const { detectLoopsForChat } = await import('../src/services/loops/loop-detector');

const runId = randomUUID();
const email = `loops-smoke-${runId}@example.invalid`;
const password = randomUUID();
let userId: string | null = null;

async function must<T>(value: T | null, error: { message: string } | null, action: string): Promise<T> {
  if (error || value === null) throw new Error(`${action}: ${error?.message || 'no result'}`);
  return value;
}

async function cleanupSmokeUser(id: string): Promise<void> {
  // Remove rows that emit desktop-sync deletion events while the profile still
  // exists. Otherwise a cascading profile delete can make the sync trigger
  // insert an event after its parent user has disappeared.
  for (const table of [
    'loops',
    'messages',
    'chats',
    'contacts',
    'user_preferences',
    'smart_cards',
    'contact_profiles',
    'chat_categories',
    'desktop_sync_events',
  ] as const) {
    const { error } = await supabase.from(table).delete().eq('user_id', id);
    if (error) throw new Error(`Cleaning ${table}: ${error.message}`);
  }

  const { error: profileError } = await supabase.from('users').delete().eq('id', id);
  if (profileError) throw new Error(`Cleaning user profile: ${profileError.message}`);

  await authHelpers.deleteUser(id);
}

try {
  // Recover from a prior interrupted run before creating another disposable
  // account. The prefix is reserved exclusively for this script.
  const staleUsers = await supabase
    .from('users')
    .select('id')
    .like('email', 'loops-smoke-%@example.invalid');
  if (staleUsers.error) throw new Error(`Finding stale smoke users: ${staleUsers.error.message}`);
  for (const staleUser of staleUsers.data ?? []) {
    await cleanupSmokeUser(staleUser.id);
  }

  const user = await authHelpers.createUser(email, password, { name: 'Open Loops smoke test' });
  userId = user?.id ?? null;
  if (!userId) throw new Error('Creating smoke-test user returned no id');
  await authHelpers.ensureUserProfile(user);

  const now = Date.now();
  const chat = await supabase
    .from('chats')
    .insert({
      user_id: userId,
      whatsapp_chat_id: `loops-smoke-${runId}`,
      platform_chat_id: `loops-smoke-${runId}`,
      platform: 'whatsapp',
      name: 'Open Loops smoke test',
      is_group: false,
      last_message_at: new Date(now).toISOString(),
    })
    .select('id')
    .single();
  const chatRow = await must(chat.data, chat.error, 'Creating smoke-test chat');

  const messages = await supabase.from('messages').insert([
    {
      user_id: userId,
      chat_id: chatRow.id,
      whatsapp_id: `loops-smoke-${runId}-1`,
      platform_message_id: `loops-smoke-${runId}-1`,
      platform: 'whatsapp',
      content: "I'll send the synthetic loop report by Friday.",
      from_me: true,
      type: 'text',
      content_type: 'text',
      timestamp: new Date(now - 1_000).toISOString(),
      is_group: false,
    },
    {
      user_id: userId,
      chat_id: chatRow.id,
      whatsapp_id: `loops-smoke-${runId}-2`,
      platform_message_id: `loops-smoke-${runId}-2`,
      platform: 'whatsapp',
      content: 'Thank you — I will look for it then.',
      from_me: false,
      type: 'text',
      content_type: 'text',
      timestamp: new Date(now).toISOString(),
      is_group: false,
      contact_name: 'Smoke Test Counterparty',
    },
  ]);
  if (messages.error) throw new Error(`Creating smoke-test messages: ${messages.error.message}`);

  const result = await detectLoopsForChat(userId, chatRow.id);
  if (!result.ran || result.created < 1) {
    throw new Error(`Detector did not create a loop: ${JSON.stringify(result)}`);
  }

  const loops = await supabase
    .from('loops')
    .select('id, title, status, evidence_count')
    .eq('user_id', userId)
    .eq('chat_id', chatRow.id)
    .eq('status', 'open');
  const loop = await must(loops.data?.[0] ?? null, loops.error, 'Reading detected loop');

  const evidence = await supabase
    .from('loop_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('loop_id', loop.id)
    .eq('kind', 'evidence');
  if (evidence.error || (evidence.count ?? 0) < 1) {
    throw new Error(`Detected loop has no evidence: ${evidence.error?.message || 'none'}`);
  }

  console.log(JSON.stringify({
    ok: true,
    created: result.created,
    loop: { id: loop.id, title: loop.title, status: loop.status, evidenceCount: evidence.count },
    provider: result.provider,
    tokens: { input: result.inputTokens, output: result.outputTokens },
  }));
} finally {
  if (userId) await cleanupSmokeUser(userId);
}
