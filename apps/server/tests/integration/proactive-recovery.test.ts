import { afterAll, describe, expect, it } from 'bun:test';
import postgres from 'postgres';
// Never read DATABASE_URL: these tests may only target a disposable local DB.
const url = process.env.CLAIRE_RECOVERY_TEST_DATABASE_URL;
if (url && (!['localhost','127.0.0.1'].includes(new URL(url).hostname) || new URL(url).pathname !== '/claire_recovery_test')) throw new Error('Use a local disposable claire_recovery_test database');
const sql = url ? postgres(url, { max: 8 }) : null;
afterAll(async () => { await sql?.end(); });
const suite = url ? describe : describe.skip;
const user = '10000000-0000-0000-0000-000000000001';
const foreign = '10000000-0000-0000-0000-000000000002';
const chat = '20000000-0000-0000-0000-000000000001';
async function loop() { return (await sql!`INSERT INTO loops(user_id,chat_id) VALUES(${user},${chat}) RETURNING *`)[0]; }
async function transition(id: string, version: number, patch: object, actor = 'user', payload = {}, kind = 'user_edit', userId = user) {
  return (await sql!`SELECT * FROM apply_loop_transition(${userId}::uuid,${id}::uuid,${version}::bigint,${sql!.json(patch)},${actor},${kind},'Synthetic test',${sql!.json(payload)},NULL)`)[0];
}
suite('proactive recovery / real Postgres', () => {
  it('prepares synthetic principals', async () => {
    await sql!`INSERT INTO users(id) VALUES(${user}),(${foreign}) ON CONFLICT DO NOTHING`;
    await sql!`INSERT INTO chats(id,user_id) VALUES(${chat},${user}) ON CONFLICT DO NOTHING`;
  });
  it('blocks autonomous closure and terminal-state bypass', async () => {
    const row = await loop();
    await expect(transition(row.id,1,{ thread_state:'resolved' },'detector')).rejects.toThrow();
    await expect(transition(row.id,1,{ status:'done' },'detector')).rejects.toThrow();
    expect((await sql!`SELECT status FROM loops WHERE id=${row.id}`)[0].status).toBe('open');
  });
  it('records cancellation without completion, requires reopen before snooze', async () => {
    const row = await loop();
    const closed = await transition(row.id,1,{ status:'done',resolution:'cancelled' });
    expect(closed.status).toBe('dropped'); expect(closed.thread_state).toBe('resolved');
    expect(closed.completed_at).toBeNull(); expect(closed.resolved_at).not.toBeNull();
    expect((await sql!`SELECT count(*)::int n FROM loop_events WHERE loop_id=${row.id} AND actor='user'`)[0].n).toBe(1);
    await expect(transition(row.id,closed.row_version,{status:'snoozed'})).rejects.toThrow();
    const reopened = await transition(row.id,closed.row_version,{status:'open'});
    expect(reopened.resolved_at).toBeNull(); expect(reopened.resolution).toBeNull(); expect(reopened.snoozed_until).toBeNull();
  });
  it('rejects stale and foreign proposal applications', async () => {
    const row = await loop();
    await transition(row.id,1,{},'detector',{suggestedResolution:'fulfilled',expectedVersion:1},'agent_note');
    const [proposal] = await sql!`SELECT id FROM loop_events WHERE loop_id=${row.id} AND kind='agent_note'`;
    const edited = await transition(row.id,1,{owner:'them'});
    await expect(transition(row.id,edited.row_version,{status:'done',resolution:'fulfilled'},'user',{reviewedSuggestionEventId:proposal.id})).rejects.toThrow();
    await expect(transition(row.id,edited.row_version,{status:'done'},'user',{},'user_edit',foreign)).rejects.toThrow();
  });
  it('permits exactly one concurrent transition and preserves corrected fields', async () => {
    const row = await loop();
    const results = await Promise.allSettled([transition(row.id,1,{owner:'them'}),transition(row.id,1,{owner:'shared'})]);
    expect(results.filter(r => r.status==='fulfilled')).toHaveLength(1);
    const [current] = await sql!`SELECT * FROM loops WHERE id=${row.id}`;
    const detected = await transition(row.id,current.row_version,{owner:'me',deadline:'2030-01-01T12:00:00Z'},'detector');
    expect(detected.owner).toBe(current.owner); expect(detected.deadline).not.toBeNull();
  });
  it('rolls back the mutation if its timeline write fails', async () => {
    const row = await loop();
    await sql!`ALTER TABLE loop_events ADD CONSTRAINT synthetic_failure CHECK(summary <> 'Synthetic test') NOT VALID`;
    try { await expect(transition(row.id,1,{status:'done'})).rejects.toThrow(); }
    finally { await sql!`ALTER TABLE loop_events DROP CONSTRAINT synthetic_failure`; }
    expect((await sql!`SELECT status FROM loops WHERE id=${row.id}`)[0].status).toBe('open');
  });
  it('preserves active trailing traffic, late arrivals and message edits', async () => {
    await sql!`INSERT INTO messages(user_id,chat_id,content) VALUES(${user},${chat},'Synthetic: send the deck')`;
    await sql!`UPDATE chat_loop_work SET next_run_at=now()-interval '1 second',lease_until=NULL WHERE chat_id=${chat}`;
    const [claimed] = await sql!`SELECT * FROM claim_chat_loop_work()`;
    await sql!`INSERT INTO messages(user_id,chat_id,content,timestamp) VALUES(${user},${chat},'Synthetic: late request','2020-01-01')`;
    await sql!`UPDATE chat_loop_work SET processed_generation=${claimed.generation},lease_until=NULL WHERE chat_id=${chat} AND lease_token=${claimed.lease_token}`;
    const [work] = await sql!`SELECT * FROM chat_loop_work WHERE chat_id=${chat}`;
    expect(Number(work.generation)).toBeGreaterThan(Number(work.processed_generation));
    const [late] = await sql!`SELECT * FROM messages WHERE chat_id=${chat} ORDER BY loop_ingest_seq DESC LIMIT 1`;
    await sql!`UPDATE messages SET content='Synthetic: edited request' WHERE id=${late.id}`;
    expect(Number((await sql!`SELECT loop_ingest_seq FROM messages WHERE id=${late.id}`)[0].loop_ingest_seq)).toBeGreaterThan(Number(work.generation));
  });
  it('does not create phantom work for duplicate message upserts', async () => {
    const [message] = await sql!`INSERT INTO messages(user_id,chat_id,content) VALUES(${user},${chat},'Synthetic duplicate') RETURNING id`;
    const before = (await sql!`SELECT generation FROM chat_loop_work WHERE chat_id=${chat}`)[0].generation;
    await sql!`INSERT INTO messages(id,user_id,chat_id,content) VALUES(${message.id},${user},${chat},'Synthetic duplicate') ON CONFLICT(id) DO UPDATE SET content=excluded.content`;
    expect((await sql!`SELECT generation FROM chat_loop_work WHERE chat_id=${chat}`)[0].generation).toBe(before);
    await sql!`INSERT INTO messages(id,user_id,chat_id,content) VALUES(${message.id},${user},${chat},'Synthetic changed') ON CONFLICT(id) DO UPDATE SET content=excluded.content`;
    const after = (await sql!`SELECT generation FROM chat_loop_work WHERE chat_id=${chat}`)[0].generation;
    expect(Number(after)).toBe(Number(before) + 1);
    expect((await sql!`SELECT loop_ingest_seq FROM messages WHERE id=${message.id}`)[0].loop_ingest_seq).toBe(after);
  });
  it('recovers expired leases and fences old workers', async () => {
    await sql!`UPDATE chat_loop_work SET lease_until=now()-interval '1 minute',next_run_at=now()-interval '1 minute' WHERE chat_id=${chat}`;
    const [old] = await sql!`SELECT lease_token FROM chat_loop_work WHERE chat_id=${chat}`;
    const [claimed] = await sql!`SELECT * FROM claim_chat_loop_work()`;
    expect(claimed.lease_token).not.toBe(old.lease_token);
    expect(await sql!`UPDATE chat_loop_work SET processed_generation=generation WHERE chat_id=${chat} AND lease_token=${old.lease_token} RETURNING *`).toHaveLength(0);
  });
  it('reserves only two daily episodes across simultaneous devices', async () => {
    await sql!`DELETE FROM loop_notification_budget WHERE user_id=${user}`;
    const results = await Promise.all(Array.from({length:8},(_,i) => sql!`SELECT reserve_loop_notification(${user}::uuid,${'synthetic-'+i},'America/Mexico_City') AS accepted`));
    expect(results.filter(r => r[0].accepted)).toHaveLength(2);
    const [episode] = await sql!`SELECT episode FROM loop_notification_budget WHERE user_id=${user} LIMIT 1`;
    expect((await sql!`SELECT reserve_loop_notification(${user}::uuid,${episode.episode},'America/Mexico_City') AS accepted`)[0].accepted).toBe(true);
  });
  it('claims delivery once and recovers after a worker crash', async () => {
    const row = await loop();
    const [delivery] = await sql!`INSERT INTO notification_deliveries(user_id,loop_id,state,outbox_payload) VALUES(${user},${row.id},'queued','{}') RETURNING *`;
    const results = await Promise.all([sql!`SELECT * FROM claim_loop_delivery(${delivery.id})`,sql!`SELECT * FROM claim_loop_delivery(${delivery.id})`]);
    expect(results.flat()).toHaveLength(1);
    await sql!`UPDATE notification_deliveries SET lease_until=now()-interval '1 second' WHERE id=${delivery.id}`;
    expect(await sql!`SELECT * FROM claim_loop_delivery(${delivery.id})`).toHaveLength(1);
  });
  it('counts provider acceptance once across devices and schedules another review', async () => {
    const row = await loop();
    await sql!`UPDATE loops SET reminder_plan_state='enqueued' WHERE id=${row.id}`;
    await Promise.all([sql!`SELECT accept_loop_reminder(${row.id},${user},1)`,sql!`SELECT accept_loop_reminder(${row.id},${user},1)`]);
    const [current] = await sql!`SELECT * FROM loops WHERE id=${row.id}`;
    expect(current.reminder_count).toBe(1); expect(current.reminder_plan_state).toBe('sent'); expect(current.next_review_at).not.toBeNull();
  });
  it('makes age a review item, never proof of completion', async () => {
    const row = await loop();
    await sql!`UPDATE loops SET thread_state='proposed',last_evidence_at=now()-interval '30 days' WHERE id=${row.id}`;
    await sql!`SELECT refresh_loop_reviews()`;
    expect((await sql!`SELECT status FROM loops WHERE id=${row.id}`)[0].status).toBe('open');
    expect((await sql!`SELECT reason FROM loop_attention WHERE loop_id=${row.id}`)[0].reason).toBe('stale_proposal');
  });
  it('denies worker and transition RPCs to end-user roles', async () => {
    const [result] = await sql!`SELECT has_function_privilege('authenticated','apply_loop_transition(uuid,uuid,bigint,jsonb,text,text,text,jsonb,text)','EXECUTE') can_edit,has_function_privilege('anon','claim_chat_loop_work()','EXECUTE') can_claim`;
    expect(result.can_edit).toBe(false); expect(result.can_claim).toBe(false);
  });
  it('does not allow a stale worker to move the cursor backwards', async () => {
    await sql!`SELECT advance_chat_loop_cursor(${user},${chat},now(),NULL,false,'test',100)`;
    await sql!`SELECT advance_chat_loop_cursor(${user},${chat},now(),NULL,false,'stale',50)`;
    expect(Number((await sql!`SELECT last_ingest_seq FROM chat_loop_cursors WHERE user_id=${user} AND chat_id=${chat}`)[0].last_ingest_seq)).toBe(100);
  });
  it('recovers a disabled-device episode after registration changes', async () => {
    const row = await loop();
    await sql!`UPDATE loops SET reminder_plan_state='enqueued' WHERE id=${row.id}`;
    const [device] = await sql!`INSERT INTO notification_devices(user_id,token) VALUES(${user},'synthetic-token') RETURNING *`;
    const [updated] = await sql!`SELECT reminder_revision,reminder_plan_state FROM loops WHERE id=${row.id}`;
    expect(updated.reminder_revision).toBe(2); expect(updated.reminder_plan_state).toBe('pending');
    await sql!`UPDATE notification_devices SET enabled=false WHERE id=${device.id}`;
    await sql!`INSERT INTO user_preferences(user_id,notification_enabled) VALUES(${user},false)`;
    expect((await sql!`SELECT reminder_revision FROM loops WHERE id=${row.id}`)[0].reminder_revision).toBe(4);
  });
  it('makes a bounded recovery replay atomic, versioned and idempotent', async () => {
    await sql!`UPDATE chat_loop_work SET lease_until=NULL WHERE chat_id=${chat}`;
    const [work] = await sql!`SELECT generation FROM chat_loop_work WHERE chat_id=${chat}`;
    const ids = (await sql!`SELECT id FROM messages WHERE chat_id=${chat} LIMIT 2`).map(row => row.id);
    const scope = [{chatId:chat,generation:Number(work.generation),messageIds:ids}];
    const hash = 'synthetic-' + crypto.randomUUID();
    const [first] = await sql!`SELECT apply_loop_recovery(${user},${hash},${sql!.json(scope)}) result`;
    expect(first.result.messagesQueued).toBe(ids.length);
    expect((await sql!`SELECT apply_loop_recovery(${user},${hash},${sql!.json(scope)}) result`)[0].result.alreadyApplied).toBe(true);
    await expect(Promise.resolve(sql!`SELECT apply_loop_recovery(${user},${hash+'-changed'},${sql!.json(scope)})`)).rejects.toThrow();
  });
  it('rejects closure from a legacy worker that bypasses the transition RPC', async () => {
    const row = await loop();
    await expect(Promise.resolve(sql!`UPDATE loops SET status='done' WHERE id=${row.id}`)).rejects.toThrow();
  });

  it('builds one digest of three items and excludes those episodes from standalone pushes', async () => {
    await sql!`DELETE FROM user_preferences WHERE user_id=${user}`;
    await sql!`INSERT INTO user_preferences(user_id) VALUES(${user})`;
    await sql!`INSERT INTO notification_devices(user_id,token) VALUES(${user},'synthetic-digest-device')`;
    const rows = [];
    for (let i=0;i<5;i++) {
      const row = await loop(); rows.push(row);
      await sql!`UPDATE loops SET next_review_at=now()-interval '1 hour',reminder_plan_state='scheduled',next_reminder_at=now()-interval '1 hour' WHERE id=${row.id}`;
    }
    await sql!`SELECT refresh_loop_reviews()`;
    await sql!`SELECT prepare_loop_digests()`;
    await sql!`SELECT prepare_loop_digests()`;
    const digests = await sql!`SELECT * FROM loop_daily_digests WHERE user_id=${user}`;
    expect(digests).toHaveLength(1);
    const items = await sql!`SELECT * FROM loop_digest_items WHERE digest_id=${digests[0].id}`;
    expect(items).toHaveLength(3);
    const first = items[0];
    expect((await sql!`SELECT reserve_loop_notification(${user},${first.loop_id+':'+first.revision},'UTC') accepted`)[0].accepted).toBe(false);
    expect((await sql!`SELECT reserve_loop_notification(${user},${'digest:'+digests[0].id},'UTC') accepted`)[0].accepted).toBe(true);
    await sql!`SELECT accept_loop_digest(${digests[0].id},${user})`;
    expect((await sql!`SELECT reminder_count FROM loops WHERE id=${first.loop_id}`)[0].reminder_count).toBe(1);
  });

  it('rejects a closure suggestion if the conversation changed before detection catches up', async () => {
    const row = await loop();
    const generation = Number((await sql!`SELECT generation FROM chat_loop_work WHERE chat_id=${chat}`)[0].generation);
    await transition(row.id,1,{},'detector',{suggestedResolution:'fulfilled',expectedVersion:1,expectedChatGeneration:generation},'agent_note');
    const [proposal] = await sql!`SELECT id FROM loop_events WHERE loop_id=${row.id} AND kind='agent_note'`;
    await sql!`INSERT INTO messages(user_id,chat_id,content) VALUES(${user},${chat},'Synthetic: actually we still need the revision')`;
    await expect(transition(row.id,1,{status:'done',resolution:'fulfilled'},'user',{reviewedSuggestionEventId:proposal.id})).rejects.toThrow();
    expect((await sql!`SELECT status FROM loops WHERE id=${row.id}`)[0].status).toBe('open');
  });
  it('applies a current, explicitly reviewed fulfillment proposal', async () => {
    const row = await loop();
    const generation = Number((await sql!`SELECT generation FROM chat_loop_work WHERE chat_id=${chat}`)[0].generation);
    await transition(row.id,1,{},'detector',{suggestedResolution:'fulfilled',expectedVersion:1,expectedChatGeneration:generation},'agent_note');
    const [proposal] = await sql!`SELECT id FROM loop_events WHERE loop_id=${row.id} AND kind='agent_note'`;
    const updated = await transition(row.id,1,{status:'done',resolution:'fulfilled'},'user',{reviewedSuggestionEventId:proposal.id});
    expect(updated.status).toBe('done'); expect(updated.completed_at).not.toBeNull();
  });

});
