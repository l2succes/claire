import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

mock.module('../../src/utils/logger', () => ({
  logger: { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} },
}));

type QueryResult = { data?: any; error?: any };
const responses: QueryResult[] = [];
const queryCalls: Array<{ table: string; method: string; args: any[] }> = [];

function chainFor(table: string): any {
  const chain: any = {};
  for (const method of ['select', 'eq', 'in', 'order', 'limit', 'lte', 'single', 'update', 'insert']) {
    chain[method] = (...args: any[]) => {
      queryCalls.push({ table, method, args });
      return chain;
    };
  }
  chain.then = (resolve: (value: QueryResult) => void) => resolve(responses.shift() || { data: [], error: null });
  return chain;
}

mock.module('../../src/services/supabase', () => ({
  supabase: { from: (table: string) => chainFor(table) },
}));

const deliveryCalls: any[] = [];
let deliveryResult = { queued: 1, outcome: 'queued' as const };
mock.module('../../src/services/notification-delivery', () => ({
  notificationDeliveryService: {
    enqueueLoopReminder: async (event: any) => {
      deliveryCalls.push(event);
      return deliveryResult;
    },
  },
}));

import { ReminderScheduler, type ReminderQueue } from '../../src/services/reminder-scheduler';

const addCalls: Array<{ data: any; opts: any }> = [];
let closeCalled = false;

function queue(): ReminderQueue {
  return {
    add: async (data, opts) => { addCalls.push({ data, opts }); return { id: 'job' }; },
    process: () => {},
    on: () => {},
    close: async () => { closeCalled = true; },
  };
}

function liveLoop(overrides: Record<string, unknown> = {}) {
  return {
    id: 'loop-1',
    user_id: 'user-1',
    title: 'Send the deck',
    content: 'Send the deck',
    status: 'open',
    visibility: 'surfaced',
    owner: 'me',
    thread_state: 'agreed',
    deadline: '2026-09-10T20:00:00.000Z',
    deadline_precision: 'exact',
    snoozed_until: null,
    priority_score: 60,
    reminder_revision: 3,
    reminder_count: 0,
    reminder_reason: 'deadline_soon',
    ...overrides,
  };
}

describe('ReminderScheduler', () => {
  let scheduler: ReminderScheduler;

  beforeEach(() => {
    responses.length = 0;
    queryCalls.length = 0;
    addCalls.length = 0;
    deliveryCalls.length = 0;
    closeCalled = false;
    deliveryResult = { queued: 1, outcome: 'queued' };
    scheduler = new ReminderScheduler();
    scheduler._setQueue(queue());
  });

  afterEach(async () => {
    if (scheduler.isStarted) await scheduler.stop();
  });

  it('starts once and closes its queue', async () => {
    // Initial refresh and due-query.
    responses.push({ data: [], error: null }, { data: [], error: null });
    scheduler.start();
    scheduler.start();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await scheduler.stop();
    expect(closeCalled).toBe(true);
    expect(scheduler.isStarted).toBe(false);
  });

  it('plans a pending loop in the user device timezone', async () => {
    responses.push(
      { data: [liveLoop()], error: null },
      { data: [{ user_id: 'user-1', timezone: 'America/Mexico_City' }], error: null },
      { data: null, error: null },
    );
    await scheduler.refreshPendingPlans(new Date('2026-09-08T15:00:00.000Z'));
    const update = queryCalls.find((call) => call.method === 'update');
    expect(update?.args[0]).toEqual({
      reminder_plan_state: 'scheduled',
      next_reminder_at: '2026-09-10T18:00:00.000Z',
      reminder_reason: 'deadline_soon',
    });
  });

  it('marks an undated low-priority loop quiet', async () => {
    responses.push(
      { data: [liveLoop({ deadline: null })], error: null },
      { data: [], error: null },
      { data: null, error: null },
    );
    await scheduler.refreshPendingPlans(new Date('2026-09-08T15:00:00.000Z'));
    const update = queryCalls.find((call) => call.method === 'update');
    expect(update?.args[0]).toEqual({
      reminder_plan_state: 'quiet',
      next_reminder_at: null,
      reminder_reason: null,
    });
  });

  it('deduplicates due jobs by loop revision', async () => {
    responses.push({ data: [liveLoop()], error: null });
    await scheduler.enqueueDeadlineReminders(new Date('2026-09-10T18:00:00.000Z'));
    expect(addCalls).toHaveLength(1);
    expect(addCalls[0].opts.jobId).toBe('reminder-loop-1-r3');
  });

  it('delivers a manual trigger through the reliable device service', async () => {
    responses.push(
      { data: liveLoop(), error: null },
      { data: null, error: null },
    );
    const result = await scheduler.triggerReminderForLoop('loop-1');
    expect(result).toEqual({ sent: true });
    expect(deliveryCalls[0]).toMatchObject({
      loopId: 'loop-1',
      revision: 3,
      userId: 'user-1',
      reason: 'act_now',
    });
    const update = queryCalls.find((call) => call.method === 'update');
    expect(update?.args[0]).toMatchObject({ reminder_plan_state: 'sent', reminder_count: 1, next_reminder_at: null });
  });

  it('keeps a due plan retryable when the user has no registered device', async () => {
    deliveryResult = { queued: 0, outcome: 'no_devices' } as never;
    responses.push(
      { data: liveLoop(), error: null },
      { data: null, error: null },
    );
    expect(await scheduler.triggerReminderForLoop('loop-1')).toEqual({ sent: false });
    const update = queryCalls.find((call) => call.method === 'update');
    expect(update?.args[0].next_reminder_at).toBeString();
    expect(update?.args[0].reminder_plan_state).toBeUndefined();
  });
});
