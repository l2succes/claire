/** Read-only by default. An explicit, hash-bound plan is required to replay. */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { supabase } from '../src/services/supabase';

const args = process.argv.slice(2);
const arg = (name: string) => args[args.indexOf(name) + 1];
const has = (name: string) => args.includes(name);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
if (!has('--user')) throw new Error('Required: --user UUID. Default: dry-run --output plan.json. Apply: --apply plan.json --sha256 HASH');
const userId = arg('--user');
if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error('Invalid user UUID');

if (has('--apply')) {
  const raw = await readFile(arg('--apply'), 'utf8');
  if (!has('--sha256') || hash(raw) !== arg('--sha256')) throw new Error('Plan hash does not match the reviewed file');
  const plan = JSON.parse(raw);
  if (plan.version !== 1 || plan.userId !== userId) throw new Error('Plan scope mismatch');
  const planAge = Date.now() - Date.parse(plan.createdAt);
  if (!Number.isFinite(planAge) || planAge < 0 || planAge > 24 * 60 * 60_000) throw new Error('Plan expired or has an invalid creation time; generate a new dry run');
  const { data, error } = await supabase.rpc('apply_loop_recovery', { p_user_id: userId, p_plan_hash: hash(raw), p_scope: plan.chats });
  if (error) throw error;
  console.log(JSON.stringify(data));
} else {
  const days = has('--days') ? Number(arg('--days')) : 14;
  if (!Number.isInteger(days) || days < 1 || days > 30) throw new Error('--days must be between 1 and 30');
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data: chats, error } = await supabase.from('chats').select('id,is_group,ai_enabled')
    .eq('user_id', userId).gte('last_message_at', since).order('last_message_at', { ascending: false }).limit(20);
  if (error) throw error;
  const { data: prefs, error: prefsError } = await supabase.from('user_preferences').select('loop_detection_enabled,preferences').eq('user_id', userId).maybeSingle();
  if (prefsError) throw prefsError;
  const scope = [];
  for (const chat of chats ?? []) {
    if (!(chat.ai_enabled ?? !chat.is_group)) continue;
    const [{ data: work, error: workError }, { data: messages, error: messageError }] = await Promise.all([
      supabase.from('chat_loop_work').select('generation').eq('user_id', userId).eq('chat_id', chat.id).maybeSingle(),
      supabase.from('messages').select('id,timestamp').eq('user_id', userId).eq('chat_id', chat.id).eq('is_deleted', false)
        .gte('timestamp', since).order('timestamp', { ascending: true }).order('id', { ascending: true }).limit(200),
    ]);
    if (workError) throw workError;
    if (messageError) throw messageError;
    if (messages?.length) scope.push({ chatId: chat.id, generation: Number(work?.generation ?? 0), messageIds: messages.map(message => message.id) });
  }
  const { data: inconsistent, error: loopError } = await supabase.from('loops').select('id,row_version,status,thread_state')
    .eq('user_id', userId).in('status', ['open','waiting','snoozed']).eq('thread_state', 'resolved').limit(200);
  if (loopError) throw loopError;
  const { data: closures, error: closureError } = await supabase.from('loops').select('id,row_version,status,resolution')
    .eq('user_id', userId).eq('source', 'detector').in('status', ['done','dropped'])
    .gte('resolved_at', since).order('resolved_at', { ascending: false }).limit(200);
  if (closureError) throw closureError;
  const plan = { version: 1, userId, createdAt: new Date().toISOString(), since,
    detectionEnabled: prefs?.loop_detection_enabled !== false && prefs?.preferences?.ai_enabled !== false,
    chats: scope, needsManualReview: inconsistent ?? [], recentAutonomousClosuresToReview: closures ?? [],
    note: 'Apply queues only the listed message IDs. It does not change preferences, close loops or infer completion. Inconsistent loops require individual review. Limits: 20 chats and 200 messages/chat; inspect coverage before applying.',
  };
  const raw = JSON.stringify(plan, null, 2) + '\n';
  const output = has('--output') ? arg('--output') : 'proactive-recovery-plan.json';
  await writeFile(output, raw, { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ output, sha256: hash(raw), chats: scope.length, messages: scope.reduce((n, chat) => n + chat.messageIds.length, 0), detectionEnabled: plan.detectionEnabled, needsManualReview: plan.needsManualReview.length }));
}
