import { afterAll, describe, expect, it } from 'bun:test';
import postgres from 'postgres';

// Use the proactive-recovery fixture plus the loop-created migration. Never
// accept production credentials for tests which insert synthetic loops.
const url = process.env.CLAIRE_RECOVERY_TEST_DATABASE_URL;
if (url && (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)
  || new URL(url).pathname !== '/claire_recovery_test')) {
  throw new Error('Use a local disposable claire_recovery_test database');
}
const sql = url ? postgres(url) : null;
afterAll(async () => { await sql?.end(); });
const suite = url ? describe : describe.skip;

async function owner() {
  const id = crypto.randomUUID();
  await sql!`INSERT INTO users(id) VALUES(${id})`;
  await sql!`INSERT INTO notification_devices(user_id,token) VALUES(${id},${'synthetic-' + id})`;
  return id;
}

suite('loop creation alerts / real Postgres', () => {
  it('atomically queues one alert per enabled device for detector and manual loops', async () => {
    const user = await owner();
    await sql!`INSERT INTO notification_devices(user_id,token) VALUES(${user},'synthetic-second')`;
    await sql!`INSERT INTO notification_devices(user_id,token,enabled) VALUES(${user},'synthetic-disabled',false)`;
    const otherUser = await owner();
    for (const source of ['detector', 'user']) {
      const [loop] = await sql!`INSERT INTO loops(user_id,source,title) VALUES(${user},${source},'Discuss fundraising') RETURNING *`;
      const deliveries = await sql!`SELECT * FROM notification_deliveries WHERE loop_id=${loop.id}`;
      expect(deliveries).toHaveLength(2);
      for (const delivery of deliveries) {
        expect(delivery.user_id).toBe(user);
        expect(delivery.user_id).not.toBe(otherUser);
        expect(delivery.notification_type).toBe('loop_created');
        expect(delivery.subject_revision).toBe(0);
        expect(delivery.state).toBe('queued');
        expect(delivery.outbox_payload).toMatchObject({
          title: 'New loop created', body: 'Discuss fundraising',
          categoryId: 'claire_loop', channelId: 'loops',
          collapseId: `loop-created:${loop.id}`,
          data: { type: 'loop_created', loopId: loop.id, url: `claire://loops/${loop.id}` },
        });
      }
      await sql!`UPDATE loops SET title='Updated title' WHERE id=${loop.id}`;
      expect(await sql!`SELECT id FROM notification_deliveries WHERE loop_id=${loop.id}`).toHaveLength(2);
      const d = deliveries[0];
      await sql!`INSERT INTO notification_deliveries(user_id,device_id,loop_id,notification_type,subject_revision,state)
        VALUES(${user},${d.device_id},${loop.id},'loop_created',0,'queued') ON CONFLICT DO NOTHING`;
      expect(await sql!`SELECT id FROM notification_deliveries WHERE loop_id=${loop.id}`).toHaveLength(2);
    }
  });

  it('does not alert for shadow or suppressed detection results', async () => {
    const user = await owner();
    for (const visibility of ['shadow', 'suppressed']) {
      await sql!`INSERT INTO loops(user_id,visibility) VALUES(${user},${visibility})`;
    }
    expect(await sql!`SELECT id FROM notification_deliveries WHERE user_id=${user}`).toHaveLength(0);
  });

  it('honors master and loop preferences, with no historical replay when enabled', async () => {
    const user = await owner();
    await sql!`INSERT INTO user_preferences(user_id,notification_enabled) VALUES(${user},false)`;
    await sql!`INSERT INTO loops(user_id) VALUES(${user})`;
    await sql!`UPDATE user_preferences SET notification_enabled=true,preferences='{"notify_loops":false}' WHERE user_id=${user}`;
    await sql!`INSERT INTO loops(user_id) VALUES(${user})`;
    await sql!`UPDATE user_preferences SET preferences='{"notify_loops":true}' WHERE user_id=${user}`;
    expect(await sql!`SELECT id FROM notification_deliveries WHERE user_id=${user}`).toHaveLength(0);
    await sql!`INSERT INTO loops(user_id) VALUES(${user})`;
    expect(await sql!`SELECT id FROM notification_deliveries WHERE user_id=${user}`).toHaveLength(1);
  });

  it('rolls back the alert with a failed loop transaction', async () => {
    const user = await owner();
    await expect(sql!.begin(async tx => {
      await tx`INSERT INTO loops(user_id) VALUES(${user})`;
      throw new Error('Synthetic rollback');
    })).rejects.toThrow('Synthetic rollback');
    expect(await sql!`SELECT id FROM loops WHERE user_id=${user}`).toHaveLength(0);
    expect(await sql!`SELECT id FROM notification_deliveries WHERE user_id=${user}`).toHaveLength(0);
  });

  it('does not let acceptance recovery count creation as a reminder', async () => {
    const user = await owner();
    const [loop] = await sql!`INSERT INTO loops(user_id) VALUES(${user}) RETURNING *`;
    await sql!`UPDATE loops SET reminder_plan_state='enqueued' WHERE id=${loop.id}`;
    await sql!`UPDATE notification_deliveries SET state='submitted' WHERE loop_id=${loop.id}`;
    await sql!`SELECT refresh_loop_reviews()`;
    const [current] = await sql!`SELECT reminder_count,reminder_sent_at,reminder_plan_state FROM loops WHERE id=${loop.id}`;
    expect(current.reminder_count).toBe(0);
    expect(current.reminder_sent_at).toBeNull();
    expect(current.reminder_plan_state).toBe('enqueued');
  });

  it('does not expose the enqueue function to end-user roles', async () => {
    const [row] = await sql!`SELECT has_function_privilege('authenticated','enqueue_loop_created_notification()','EXECUTE') allowed`;
    expect(row.allowed).toBe(false);
  });
});
