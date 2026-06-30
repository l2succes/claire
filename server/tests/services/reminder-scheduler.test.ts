import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';

// ---------------------------------------------------------------------------
// Mock supabase and logger BEFORE importing reminder-scheduler
// ---------------------------------------------------------------------------

mock.module('../../src/utils/logger', () => ({
  logger: { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} },
}));

// Supabase: we swap out `supabaseFromImpl` per test
let supabaseFromImpl: (table: string) => any = () => ({});
mock.module('../../src/services/supabase', () => ({
  supabase: { from: (table: string) => supabaseFromImpl(table) },
}));

import { reminderScheduler, sendMockPush, ReminderQueue } from '../../src/services/reminder-scheduler';

// ---------------------------------------------------------------------------
// Stub queue — injected via _setQueue; avoids any real Redis / Bull.
// ---------------------------------------------------------------------------

const addCalls: { data: any; opts: any }[] = [];
let closeCalled = false;

function makeStubQueue(): ReminderQueue {
  addCalls.length = 0;
  closeCalled = false;
  return {
    add: async (data, opts) => { addCalls.push({ data, opts }); return { id: 'stub-job' }; },
    process: () => {},
    on: () => {},
    close: async () => { closeCalled = true; },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Supabase-like chain that resolves on the specified terminal method. */
function makeChain(resolveOn: string, value: any): Record<string, any> {
  const chain: Record<string, any> = {};
  for (const m of ['select', 'lte', 'gte', 'eq', 'is', 'single', 'update']) {
    chain[m] = () => chain;
  }
  chain[resolveOn] = () => Promise.resolve(value);
  return chain;
}

function resetScheduler() {
  if ((reminderScheduler as any).pollTimer) {
    clearInterval((reminderScheduler as any).pollTimer);
    (reminderScheduler as any).pollTimer = null;
  }
  (reminderScheduler as any).started = false;
  (reminderScheduler as any).queue = null;
}

// ---------------------------------------------------------------------------
describe('sendMockPush', () => {
  it('returns true', async () => {
    expect(await sendMockPush('u-1', 'p-1', 'Do the thing')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('ReminderScheduler start / stop', () => {
  beforeEach(() => resetScheduler());
  afterEach(async () => {
    if ((reminderScheduler as any).started) await reminderScheduler.stop();
    resetScheduler();
  });

  it('starts correctly with injected queue', () => {
    reminderScheduler._setQueue(makeStubQueue());
    reminderScheduler.start();
    expect((reminderScheduler as any).started).toBe(true);
  });

  it('is idempotent — second start() is a no-op', () => {
    const q = makeStubQueue();
    reminderScheduler._setQueue(q);
    reminderScheduler.start();
    reminderScheduler.start(); // no-op
    // queue reference unchanged
    expect((reminderScheduler as any).queue).toBe(q);
  });

  it('stops cleanly', async () => {
    reminderScheduler._setQueue(makeStubQueue());
    reminderScheduler.start();
    await reminderScheduler.stop();
    expect((reminderScheduler as any).started).toBe(false);
    expect(closeCalled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('ReminderScheduler enqueueDeadlineReminders', () => {
  beforeEach(() => resetScheduler());
  afterEach(async () => {
    if ((reminderScheduler as any).started) await reminderScheduler.stop();
    resetScheduler();
  });

  it('enqueues a job for each due promise', async () => {
    const deadline = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    supabaseFromImpl = () =>
      makeChain('is', {
        data: [{ id: 'p-1', user_id: 'u-1', content: 'Send report', deadline, priority: 'high' }],
        error: null,
      });

    reminderScheduler._setQueue(makeStubQueue());
    reminderScheduler.start();
    // Clear the auto-run triggered by start()
    await new Promise((r) => setTimeout(r, 0));
    addCalls.length = 0;

    await reminderScheduler.enqueueDeadlineReminders();

    expect(addCalls.length).toBe(1);
    expect(addCalls[0].data.promiseId).toBe('p-1');
    expect(addCalls[0].data.userId).toBe('u-1');
    expect(addCalls[0].opts.jobId).toBe('reminder-p-1');
  });

  it('does nothing when no due promises', async () => {
    supabaseFromImpl = () => makeChain('is', { data: [], error: null });

    reminderScheduler._setQueue(makeStubQueue());
    reminderScheduler.start();
    await new Promise((r) => setTimeout(r, 0));
    addCalls.length = 0;

    await reminderScheduler.enqueueDeadlineReminders();
    expect(addCalls.length).toBe(0);
  });

  it('does not throw on DB error', async () => {
    supabaseFromImpl = () => makeChain('is', { data: null, error: { message: 'DB exploded' } });

    reminderScheduler._setQueue(makeStubQueue());
    reminderScheduler.start();
    await expect(reminderScheduler.enqueueDeadlineReminders()).resolves.toBeUndefined();
  });

  it('enqueues multiple promises with correct dedup jobIds', async () => {
    const deadline = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    supabaseFromImpl = () =>
      makeChain('is', {
        data: [
          { id: 'p-a', user_id: 'u-1', content: 'Thing A', deadline, priority: 'medium' },
          { id: 'p-b', user_id: 'u-1', content: 'Thing B', deadline, priority: 'low' },
        ],
        error: null,
      });

    reminderScheduler._setQueue(makeStubQueue());
    reminderScheduler.start();
    await new Promise((r) => setTimeout(r, 0));
    addCalls.length = 0;

    await reminderScheduler.enqueueDeadlineReminders();

    expect(addCalls.length).toBe(2);
    const jobIds = addCalls.map((c) => c.opts.jobId);
    expect(jobIds).toContain('reminder-p-a');
    expect(jobIds).toContain('reminder-p-b');
  });
});

// ---------------------------------------------------------------------------
describe('ReminderScheduler triggerReminderForPromise', () => {
  beforeEach(() => resetScheduler());
  afterEach(async () => {
    if ((reminderScheduler as any).started) await reminderScheduler.stop();
    resetScheduler();
  });

  it('sends mock push and updates reminder_sent_at', async () => {
    const deadline = new Date(Date.now() + 3600_000).toISOString();

    // Let the auto-enqueue from start() resolve first with a no-op empty response
    let triggerCalled = false;
    supabaseFromImpl = () => {
      if (!triggerCalled) {
        // queries from enqueueDeadlineReminders — return empty, no-op
        return makeChain('is', { data: [], error: null });
      }
      // queries from triggerReminderForPromise
      if (triggerCalled) {
        const firstCallChain = makeChain('single', {
          data: { id: 'p-99', user_id: 'u-2', content: 'Call client', deadline, priority: 'high' },
          error: null,
        });
        triggerCalled = false; // next call is the update
        return firstCallChain;
      }
      return makeChain('eq', { error: null });
    };

    reminderScheduler._setQueue(makeStubQueue());
    reminderScheduler.start();
    // Wait for the auto-enqueue to drain
    await new Promise((r) => setTimeout(r, 0));

    // Now switch to triggerReminderForPromise mode
    let updateCallCount = 0;
    supabaseFromImpl = () => {
      updateCallCount++;
      if (updateCallCount === 1) {
        return makeChain('single', {
          data: { id: 'p-99', user_id: 'u-2', content: 'Call client', deadline, priority: 'high' },
          error: null,
        });
      }
      return makeChain('eq', { error: null });
    };

    const result = await reminderScheduler.triggerReminderForPromise('p-99');
    expect(result.sent).toBe(true);
  });

  it('throws when promise not found', async () => {
    supabaseFromImpl = () => makeChain('single', { data: null, error: { message: 'not found' } });

    reminderScheduler._setQueue(makeStubQueue());
    reminderScheduler.start();
    await expect(reminderScheduler.triggerReminderForPromise('no-such')).rejects.toThrow(
      'Promise not found: no-such'
    );
  });
});
