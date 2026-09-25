import { beforeEach, describe, expect, it, mock } from 'bun:test';
const delivery = { id: 'delivery', user_id: 'user', device_id: 'device', loop_id: 'loop', subject_revision: 3, attempts: 1, lease_token: 'lease', state: 'queued', outbox_payload: { title: 'Time to follow up', body: 'Synthetic deck', data: { type: 'loop_reminder' } } };
let rows: Record<string, any[]>;
let providerResult: any;
let reserved = true;
let failWrite = false;
const sends: any[] = [];
const rpcs: any[] = [];
mock.module('../../src/utils/logger', () => ({ logger: { info() {}, warn() {}, error() {}, debug() {} } }));
mock.module('../../src/services/notification-providers', () => ({
  expoNotificationProvider: { send: async (token: string, payload: any) => { sends.push({token,payload}); return providerResult; } },
  apnsNotificationProvider: { send: async () => providerResult },
}));
mock.module('../../src/services/supabase', () => ({ supabase: {
  rpc: async (name: string, args: any) => {
    rpcs.push({name,args});
    if (name === 'claim_loop_delivery') return { data: [{...rows.notification_deliveries[0]}], error: null };
    if (name === 'reserve_loop_notification') return { data: reserved, error: null };
    return { data: null, error: null };
  },
  from: (table: string) => {
    const filters: Array<[string,unknown]> = [];
    let patch: any;
    const execute = (single = false) => {
      if (patch && failWrite) return { data:null,error:{message:'Synthetic DB outage'} };
      const matches = (rows[table] ?? []).filter(row => filters.every(([key,value]) => row[key] === value));
      if (patch) matches.forEach(row => Object.assign(row,patch));
      return { data:single ? matches[0] ?? null : matches,error:null };
    };
    const query: any = {
      select: () => query,
      eq: (key: string,value: unknown) => { filters.push([key,value]); return query; },
      update: (value: any) => { patch=value; return query; },
      maybeSingle: async () => execute(true),
      then: (resolve: any,reject: any) => Promise.resolve(execute()).then(resolve,reject),
    };
    return query;
  },
} }));
const { NotificationDeliveryService } = await import('../../src/services/notification-delivery');
const attempt = () => (new NotificationDeliveryService() as any).deliverLoopOutbox('delivery');
beforeEach(() => {
  sends.length=0; rpcs.length=0; reserved=true; failWrite=false;
  providerResult={state:'submitted',ticketId:'ticket',receiptId:'receipt'};
  rows={
    notification_deliveries:[{...delivery}],
    notification_devices:[{id:'device',user_id:'user',device_id:'native-device',enabled:true,provider:'expo',token:'refreshed-token',timezone:'UTC'}],
    user_preferences:[{user_id:'user',notification_enabled:true,preferences:{}}],
    loops:[{id:'loop',user_id:'user',status:'open',visibility:'surfaced',reminder_revision:3,reminder_reason:'follow_up'}],
  };
});
describe('durable proactive push execution', () => {
  function creation() {
    Object.assign(rows.notification_deliveries[0], {
      notification_type: 'loop_created', subject_revision: 0,
      outbox_payload: { title: 'New loop created', body: 'Original title',
        data: { type: 'loop_created', loopId: 'loop', url: 'claire://loops/loop' } },
    });
    rows.loops[0].title = 'Discuss fundraising';
  }

  it('delivers creation after edits, even when the reminder budget is exhausted', async () => {
    creation(); reserved = false;
    rows.loops[0].reminder_revision = 8;
    await attempt();
    expect(sends).toHaveLength(1);
    expect(sends[0].payload).toEqual({ title: 'New loop created', body: 'Discuss fundraising',
      data: { type: 'loop_created', loopId: 'loop', url: 'claire://loops/loop' } });
    expect(rows.notification_deliveries[0].state).toBe('submitted');
    expect(rpcs.map(call => call.name)).toEqual(['claim_loop_delivery']);
  });

  it('defers creation during quiet hours without consuming a reminder', async () => {
    creation();
    rows.user_preferences[0].preferences = { quiet_hours_enabled: true, quiet_hours_start: '00:00', quiet_hours_end: '00:00' };
    await attempt();
    expect(sends).toHaveLength(0);
    expect(rows.notification_deliveries[0].state).toBe('queued');
    expect(rows.notification_deliveries[0].error_code).toBe('quiet_or_snoozed');
    expect(rpcs.map(call => call.name)).toEqual(['claim_loop_delivery']);
  });

  it('retries a transient creation push failure', async () => {
    creation();
    providerResult = { state: 'failed', errorCode: 'provider_unavailable', retryable: true };
    await attempt();
    expect(rows.notification_deliveries[0].state).toBe('queued');
    expect(rpcs.some(call => call.name === 'accept_loop_reminder')).toBe(false);
    providerResult = { state: 'delivered' };
    await attempt();
    expect(rows.notification_deliveries[0].state).toBe('delivered');
    expect(rpcs.some(call => call.name === 'accept_loop_reminder')).toBe(false);
  });

  it.each([
    ['closed', 'loops', { status: 'done' }],
    ['snoozed', 'loops', { status: 'snoozed' }],
    ['hidden', 'loops', { visibility: 'suppressed' }],
    ['foreign owner', 'loops', { user_id: 'someone-else' }],
    ['disabled device', 'notification_devices', { enabled: false }],
    ['disabled notifications', 'user_preferences', { notification_enabled: false }],
    ['disabled loops', 'user_preferences', { preferences: { notify_loops: false } }],
  ])('suppresses creation for %s', async (_name, table, patch) => {
    creation(); Object.assign(rows[table as string][0], patch);
    await attempt();
    expect(sends).toHaveLength(0);
    expect(rows.notification_deliveries[0].state).toBe('suppressed');
  });

  it('suppresses creation if the loop was deleted', async () => {
    creation(); rows.loops = [];
    await attempt();
    expect(sends).toHaveLength(0);
    expect(rows.notification_deliveries[0].state).toBe('suppressed');
  });

  it('reads the current token and records provider acceptance before acknowledging the loop', async () => {
    await attempt();
    expect(sends[0].token).toBe('refreshed-token');
    expect(rows.notification_deliveries[0].state).toBe('submitted');
    expect(rpcs.some(call => call.name==='accept_loop_reminder')).toBe(true);
  });
  it('suppresses an episode if the user completed it while queued', async () => {
    rows.loops[0].status='done'; await attempt();
    expect(sends).toHaveLength(0); expect(rows.notification_deliveries[0].state).toBe('suppressed');
  });
  it('rechecks the notification switch at execution time', async () => {
    rows.user_preferences[0].preferences.notify_loops=false; await attempt();
    expect(sends).toHaveLength(0); expect(rows.notification_deliveries[0].state).toBe('suppressed');
  });
  it('defers a new snooze without counting a send', async () => {
    rows.loops[0].snoozed_until=new Date(Date.now()+3_600_000).toISOString(); await attempt();
    expect(sends).toHaveLength(0); expect(rows.notification_deliveries[0].state).toBe('queued');
    expect(Date.parse(rows.notification_deliveries[0].next_attempt_at)).toBeGreaterThan(Date.now());
  });
  it('keeps budget-deferred work durable', async () => {
    reserved=false; await attempt();
    expect(sends).toHaveLength(0); expect(rows.notification_deliveries[0].error_code).toBe('daily_budget');
  });
  it('retries a transient provider error without marking the loop sent', async () => {
    providerResult={state:'failed',errorCode:'provider_unavailable',retryable:true}; await attempt();
    expect(rows.notification_deliveries[0].state).toBe('queued');
    expect(rpcs.some(call => call.name==='accept_loop_reminder')).toBe(false);
  });
  it('surfaces persistence failures rather than acknowledging an unrecorded send', async () => {
    failWrite=true; await expect(attempt()).rejects.toThrow();
    expect(rpcs.some(call => call.name==='accept_loop_reminder')).toBe(false);
  });
  it('omits stale digest items and provides no bulk completion action', async () => {
    rows.notification_deliveries[0].digest_id='digest';
    rows.loop_digest_items=[
      {digest_id:'digest',user_id:'user',revision:3,loop:{...rows.loops[0],title:'Current obligation'}},
      {digest_id:'digest',user_id:'user',revision:3,loop:{...rows.loops[0],status:'done',title:'Already completed'}},
    ];
    await attempt();
    expect(sends[0].payload.body).toBe('Current obligation');
    expect(sends[0].payload.categoryId).toBeUndefined();
    expect(rpcs.some(call => call.name==='accept_loop_digest')).toBe(true);
  });
});
