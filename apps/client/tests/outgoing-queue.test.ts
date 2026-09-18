import { OutgoingQueue } from '../services/outgoing-queue';

type Entry = { id: string; chatId: string; error?: string };
const transient = new Error('offline');
function setup(initial: Entry[] = []) {
  let disk = initial;
  const execute = jest.fn<Promise<void>, [Entry]>().mockResolvedValue(undefined);
  const write = jest.fn(async (entries: Entry[]) => { disk = JSON.parse(JSON.stringify(entries)); });
  const active = jest.fn(() => true);
  const create = () => new OutgoingQueue({ read: async () => disk, write, execute,
    active, retryable: (error) => error === transient, changed: () => undefined });
  return { create, execute, write, active, disk: () => disk };
}

describe('outgoing queue', () => {
  it('persists before accepting a send and survives worker recreation', async () => {
    const harness = setup();
    const queue = harness.create();
    await queue.enqueue({ id: 'first', chatId: 'chat' });
    expect(harness.execute).not.toHaveBeenCalled();
    const restarted = harness.create();
    await restarted.flush();
    expect(harness.execute).toHaveBeenCalledWith({ id: 'first', chatId: 'chat' });
    expect(harness.disk()).toEqual([]);
  });
  it('keeps sends and reactions ordered per chat while other conversations progress', async () => {
    const harness = setup([{ id: 'send', chatId: 'a' }, { id: 'reaction', chatId: 'a' }, { id: 'other', chatId: 'b' }]);
    harness.execute.mockImplementation(async (entry) => { if (entry.id === 'send') throw transient; });
    const queue = harness.create();
    await queue.flush();
    expect(harness.execute.mock.calls.map(([entry]) => entry.id)).toEqual(['send', 'other']);
    expect(harness.disk().map((entry) => entry.id)).toEqual(['send', 'reaction']);
    harness.execute.mockResolvedValue(undefined);
    await queue.flush();
    expect(harness.disk()).toEqual([]);
    expect(harness.execute.mock.calls.slice(2).map(([entry]) => entry.id)).toEqual(['send', 'reaction']);
  });
  it('serializes simultaneous enqueues without dropping either event', async () => {
    const harness = setup();
    const queue = harness.create();
    await Promise.all([queue.enqueue({ id: 'one', chatId: 'a' }), queue.enqueue({ id: 'two', chatId: 'a' })]);
    expect(harness.disk().map((entry) => entry.id)).toEqual(['one', 'two']);
  });
  it('does not replay concurrently or after account change', async () => {
    const harness = setup([{ id: 'one', chatId: 'a' }, { id: 'two', chatId: 'a' }]);
    let finish!: () => void;
    harness.execute.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const queue = harness.create();
    const first = queue.flush();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    await queue.flush();
    harness.active.mockReturnValue(false);
    finish(); await first;
    expect(harness.execute).toHaveBeenCalledTimes(1);
    // An old worker must not recreate private storage after logout cleared it.
    expect(harness.write).not.toHaveBeenCalled();
  });
  it('retains permanent failures for explicit retry without retrying forever', async () => {
    const harness = setup([{ id: 'one', chatId: 'a' }]);
    harness.execute.mockRejectedValue(new Error('Unsupported reaction'));
    const queue = harness.create();
    await queue.flush(); await queue.flush();
    expect(harness.execute).toHaveBeenCalledTimes(1);
    expect(harness.disk()[0].error).toBe('Unsupported reaction');
    await queue.retry();
    harness.execute.mockResolvedValue(undefined);
    await queue.flush();
    expect(harness.disk()).toEqual([]);
  });
  it('does not accept a message when durable storage fails', async () => {
    const harness = setup();
    harness.write.mockRejectedValueOnce(new Error('disk full'));
    const queue = harness.create();
    await expect(queue.enqueue({ id: 'one', chatId: 'a' })).rejects.toThrow('disk full');
    expect(queue.entries).toEqual([]);
    expect(harness.execute).not.toHaveBeenCalled();
  });
});
